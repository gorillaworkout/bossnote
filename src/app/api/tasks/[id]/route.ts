import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { queryOne, execute } from '@/lib/database';
import { deleteTaskImage } from '@/lib/image-storage';
import { assignmentPushUrl, canViewTask, type TaskParties } from '@/lib/task-access';
import { decideReassign, type Party } from '@/lib/assignment';
import { publishTaskListChange } from '@/lib/task-live';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const task = await queryOne(
    `SELECT t.*, bu.name as boss_name, au.name as assignee_name,
       bu.role AS creator_role, bu.department_id AS creator_department_id,
       au.role AS assignee_role, au.department_id AS assignee_department_id
     FROM tasks t
     JOIN users bu ON t.created_by = bu.id
     JOIN users au ON t.assignee_id = au.id
     WHERE t.id = ?`,
    [id],
  );
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  if (!canViewTask(user, taskParties(task))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Load replies
  const replies = await import('@/lib/database').then(m =>
    m.queryAll(
      `SELECT r.*, u.name as user_name, u.role as user_role
       FROM task_replies r JOIN users u ON r.user_id = u.id
       WHERE r.task_id = ?
       ORDER BY r.created_at`,
      [id],
    ),
  );

  // Filter answered questions for staff. Boss always sees the full list.
  const answeredArr = (task as Record<string, unknown>).answered_questions;
  if (task.questions && Array.isArray(answeredArr) && answeredArr.length > 0) {
    if (user.role !== 'boss') {
      const answered = new Set(answeredArr as number[]);
      task.questions = (task.questions as string[]).filter((_, i) => !answered.has(i));
      task.questions_id = (task.questions_id as string[]).filter((_, i) => !answered.has(i));
    }
  }

  return NextResponse.json({ task, replies });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const task = await loadTaskParties(id);
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json() as { status?: string; assignee_id?: string };
  const { status, assignee_id: nextAssigneeId } = body;

  if (status && ['todo', 'in_progress', 'waiting', 'done'].includes(status)) {
    if (!canViewTask(user, task)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    await execute(
      'UPDATE tasks SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, id],
    );
    publishTaskListChange();
    return NextResponse.json({ ok: true });
  }

  if (nextAssigneeId && typeof nextAssigneeId === 'string') {
    const creator = await queryOne<Party>(
      'SELECT id, name, role, department_id, email, lark_open_id FROM users WHERE id = ?',
      [task.created_by],
    );
    const nextAssignee = await queryOne<Party>(
      'SELECT id, name, role, department_id, email, lark_open_id FROM users WHERE id = ?',
      [nextAssigneeId],
    );
    const view = canViewTask(user, task);
    const decision = decideReassign({
      viewer: user,
      creator: creator ?? { id: '', name: '', role: '', department_id: null },
      nextAssignee: nextAssignee ?? null,
      task,
      canView: view,
    });
    if (!decision.ok) {
      return NextResponse.json(
        { error: decision.error, code: decision.code },
        { status: decision.status },
      );
    }
    const assignee = nextAssignee!;

    await execute(
      'UPDATE tasks SET assignee_id = ?, updated_at = NOW() WHERE id = ?',
      [nextAssigneeId, id],
    );
    publishTaskListChange();

    if (nextAssigneeId !== task.assignee_id) {
      const { sendPushToUser } = await import('@/lib/push');
      const { notifyLarkTask } = await import('@/lib/lark');
      const title = String(task.title || task.title_id || 'New task');
      void sendPushToUser(nextAssigneeId, {
        title: 'New task',
        body: title,
        url: assignmentPushUrl(id),
      }).catch((err) => console.error('[bossnote] push after reassign failed:', err));
      notifyLarkTask({
        title,
        creatorName: user.name,
        creatorId: user.id,
        assigneeName: assignee.name,
        assigneeId: assignee.id,
        assigneeOpenId: assignee.lark_open_id,
        assigneeEmail: assignee.email,
        priority: String(task.priority || 'medium'),
        kind: 'reassign',
        taskId: id,
      });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Invalid update' }, { status: 400 });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const task = await loadTaskParties(id);
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canViewTask(user, task)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (user.role !== 'boss') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await execute('DELETE FROM tasks WHERE id = ?', [id]);
  publishTaskListChange();
  deleteTaskImage(id);
  return NextResponse.json({ ok: true });
}

type PartyTask = TaskParties & {
  id: string;
  title: string | null;
  title_id: string | null;
  priority: string | null;
};

function taskParties(row: Record<string, unknown>): TaskParties {
  return {
    assignee_id: String(row.assignee_id),
    created_by: String(row.created_by),
    creator_role: String(row.creator_role),
    creator_department_id: row.creator_department_id == null ? null : String(row.creator_department_id),
    assignee_role: String(row.assignee_role),
    assignee_department_id: row.assignee_department_id == null ? null : String(row.assignee_department_id),
  };
}

async function loadTaskParties(id: string): Promise<PartyTask | undefined> {
  return queryOne<PartyTask>(
    `SELECT t.id, t.assignee_id, t.created_by, t.title, t.title_id, t.priority,
       bu.role AS creator_role, bu.department_id AS creator_department_id,
       au.role AS assignee_role, au.department_id AS assignee_department_id
     FROM tasks t
     JOIN users bu ON t.created_by = bu.id
     JOIN users au ON t.assignee_id = au.id
     WHERE t.id = ?`,
    [id],
  );
}
