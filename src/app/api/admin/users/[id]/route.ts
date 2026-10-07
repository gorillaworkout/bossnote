import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { execute, queryOne } from '@/lib/database';
import { normalizeLarkOpenId } from '@/lib/lark';
import { deleteUserBlock, validateUpdateUser } from '@/lib/managed-user';
import { requireAdmin } from '@/lib/require-admin';

const USER_ROW_SQL = `SELECT u.id, u.email, u.name, u.role, u.department_id, d.name AS department_name,
       u.lark_open_id, u.created_at
FROM users u
LEFT JOIN departments d ON d.id = u.department_id
WHERE u.id = ?`;

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSession();
  const denied = requireAdmin(user, 'Only an admin can manage users');
  if (denied || !user) return denied ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    name?: unknown;
    role?: unknown;
    department_id?: unknown;
    lark_open_id?: unknown;
  };

  const target = await queryOne<{
    id: string;
    name: string;
    role: string;
    department_id: string | null;
    lark_open_id: string | null;
  }>('SELECT id, name, role, department_id, lark_open_id FROM users WHERE id = ?', [id]);
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const parsed = validateUpdateUser({ actorId: user.id, target, body });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });

  if (parsed.name.toLowerCase() !== target.name.toLowerCase()) {
    const existing = await queryOne('SELECT id FROM users WHERE LOWER(name) = LOWER(?) AND id <> ?', [parsed.name, id]);
    if (existing) return NextResponse.json({ error: 'That name is already taken' }, { status: 409 });
  }

  if (target.role !== 'admin' && parsed.department_id) {
    const department = await queryOne('SELECT id FROM departments WHERE id = ?', [parsed.department_id]);
    if (!department) return NextResponse.json({ error: 'Department not found' }, { status: 400 });
  }

  let nextOpenId = target.lark_open_id;
  if (parsed.lark_open_id !== undefined) {
    const trimmed = typeof parsed.lark_open_id === 'string' ? parsed.lark_open_id.trim() : '';
    if (!trimmed) {
      nextOpenId = null;
    } else {
      nextOpenId = normalizeLarkOpenId(trimmed);
      if (!nextOpenId) {
        return NextResponse.json({ error: 'Lark Open ID looks invalid' }, { status: 400 });
      }
    }
  }

  await execute(
    `UPDATE users
      SET name = ?, role = COALESCE(?, role), department_id = ?, lark_open_id = ?
      WHERE id = ?`,
    [parsed.name, parsed.role, parsed.department_id, nextOpenId, id],
  );

  const updated = await queryOne(USER_ROW_SQL, [id]);
  return NextResponse.json({ user: updated, ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSession();
  const denied = requireAdmin(user, 'Only an admin can manage users');
  if (denied || !user) return denied ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const target = await queryOne<{ id: string }>('SELECT id FROM users WHERE id = ?', [id]);
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const tasks = await queryOne<{ n: string }>(
    'SELECT COUNT(*)::text AS n FROM tasks WHERE assignee_id = ? OR created_by = ?',
    [id, id],
  );
  const replies = await queryOne<{ n: string }>(
    'SELECT COUNT(*)::text AS n FROM task_replies WHERE user_id = ?',
    [id],
  );
  const block = deleteUserBlock({
    actorId: user.id,
    targetId: id,
    taskCount: Number(tasks?.n ?? 0),
    replyCount: Number(replies?.n ?? 0),
  });
  if (block) return NextResponse.json({ error: block.error }, { status: block.status });

  await execute('DELETE FROM user_settings WHERE user_id = ?', [id]);
  await execute('DELETE FROM users WHERE id = ?', [id]);
  return NextResponse.json({ ok: true });
}
