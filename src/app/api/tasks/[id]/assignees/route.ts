import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { queryAll, queryOne } from '@/lib/database';
import { canReassign, candidateListQuery } from '@/lib/assignment';
import { canViewTask, type TaskParties } from '@/lib/task-access';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const task = await queryOne<TaskParties>(
    `SELECT t.assignee_id, t.created_by,
       bu.role AS creator_role, bu.department_id AS creator_department_id,
       au.role AS assignee_role, au.department_id AS assignee_department_id
     FROM tasks t
     JOIN users bu ON t.created_by = bu.id
     JOIN users au ON t.assignee_id = au.id
     WHERE t.id = ?`,
    [id],
  );
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const view = canViewTask(user, task);
  if (!view || !canReassign(user, task, view)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const listed = candidateListQuery({
    role: task.creator_role,
    department_id: task.creator_department_id,
  });
  if (!listed) return NextResponse.json({ users: [] });

  const rows = await queryAll<{ id: string; name: string; role: string }>(listed.sql, listed.values);
  return NextResponse.json({
    users: rows.map((row) => ({ id: row.id, name: row.name, role: row.role })),
  });
}
