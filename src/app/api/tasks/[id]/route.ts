import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { queryOne, execute } from '@/lib/database';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const task = await queryOne(
    `SELECT t.*, bu.name as boss_name, au.name as assignee_name
     FROM tasks t
     JOIN users bu ON t.created_by = bu.id
     JOIN users au ON t.assignee_id = au.id
     WHERE t.id = ?`,
    [id],
  );
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  // Auth check
  if (user.role === 'member' && task.assignee_id !== user.id) {
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
  const task = await queryOne('SELECT * FROM tasks WHERE id = ?', [id]);
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { status } = await request.json() as { status?: string };

  if (status && ['todo', 'in_progress', 'waiting', 'done'].includes(status)) {
    await execute(
      'UPDATE tasks SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, id],
    );
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
  if (user.role !== 'boss') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  await execute('DELETE FROM tasks WHERE id = ?', [id]);
  return NextResponse.json({ ok: true });
}
