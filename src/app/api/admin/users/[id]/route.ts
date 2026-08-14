import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { queryOne, execute } from '@/lib/database';

function requireBoss(user: { id: string; role: string } | null) {
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'boss') return NextResponse.json({ error: 'Only a boss can manage users' }, { status: 403 });
  return null;
}

// Edit a user's name and/or role.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSession();
  const denied = requireBoss(user);
  if (denied) return denied;

  const { id } = await params;
  const { name, role } = (await request.json()) as { name?: string; role?: string };

  const target = await queryOne<{ id: string; name: string }>(
    'SELECT id, name FROM users WHERE id = ?',
    [id],
  );
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const cleanName = typeof name === 'string' ? name.trim() : target.name;
  if (!cleanName) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  if (cleanName.length > 60) return NextResponse.json({ error: 'Name is too long' }, { status: 400 });

  if (cleanName.toLowerCase() !== target.name.toLowerCase()) {
    const existing = await queryOne('SELECT id FROM users WHERE LOWER(name) = LOWER(?) AND id <> ?', [cleanName, id]);
    if (existing) return NextResponse.json({ error: 'That name is already taken' }, { status: 409 });
  }

  const cleanRole = role === 'boss' || role === 'member' ? role : null;

  if (cleanRole === 'member' && target.id === user!.id) {
    return NextResponse.json({ error: 'You cannot demote yourself' }, { status: 400 });
  }
  if (cleanRole === 'member') {
    // Prevent removing the last boss.
    const bossCount = await queryOne<{ n: string }>(
      "SELECT COUNT(*)::text AS n FROM users WHERE role = 'boss'",
    );
    if (Number(bossCount?.n ?? 0) <= 1 && target.id === user!.id) {
      return NextResponse.json({ error: 'Cannot demote the last boss' }, { status: 400 });
    }
  }

  await execute(
    'UPDATE users SET name = ?, role = COALESCE(?, role) WHERE id = ?',
    [cleanName, cleanRole, id],
  );

  const updated = await queryOne('SELECT id, email, name, role, created_at FROM users WHERE id = ?', [id]);
  return NextResponse.json({ user: updated, ok: true });
}

// Delete a user. Blocked if they own tasks/replies, are the last boss, or are self.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSession();
  const denied = requireBoss(user);
  if (denied) return denied;

  const { id } = await params;

  if (id === user!.id) return NextResponse.json({ error: 'You cannot delete yourself' }, { status: 400 });

  const target = await queryOne<{ role: string }>('SELECT role FROM users WHERE id = ?', [id]);
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  if (target.role === 'boss') {
    const bossCount = await queryOne<{ n: string }>(
      "SELECT COUNT(*)::text AS n FROM users WHERE role = 'boss'",
    );
    if (Number(bossCount?.n ?? 0) <= 1) {
      return NextResponse.json({ error: 'Cannot delete the last boss' }, { status: 400 });
    }
  }

  const tasks = await queryOne<{ n: string }>(
    'SELECT COUNT(*)::text AS n FROM tasks WHERE assignee_id = ? OR created_by = ?',
    [id, id],
  );
  const replies = await queryOne<{ n: string }>(
    'SELECT COUNT(*)::text AS n FROM task_replies WHERE user_id = ?',
    [id],
  );
  const total = Number(tasks?.n ?? 0) + Number(replies?.n ?? 0);
  if (total > 0) {
    return NextResponse.json(
      { error: `This user still has ${total} task(s)/reply(s). Reassign or delete them first.` },
      { status: 409 },
    );
  }

  await execute('DELETE FROM user_settings WHERE user_id = ?', [id]);
  await execute('DELETE FROM users WHERE id = ?', [id]);

  return NextResponse.json({ ok: true });
}
