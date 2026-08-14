import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { queryOne, execute } from '@/lib/database';
import bcrypt from 'bcryptjs';

const MIN_LEN = 6;

// Change the caller's own password (requires current password).
export async function PUT(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { current_password, new_password } = (await request.json()) as {
    current_password?: string;
    new_password?: string;
  };
  if (!current_password || !new_password) {
    return NextResponse.json({ error: 'Current and new password are required' }, { status: 400 });
  }
  if (String(new_password).length < MIN_LEN) {
    return NextResponse.json({ error: `New password must be at least ${MIN_LEN} characters` }, { status: 400 });
  }

  const row = await queryOne<{ password_hash: string }>(
    'SELECT password_hash FROM users WHERE id = ?',
    [user.id],
  );
  if (!row) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const valid = await bcrypt.compare(String(current_password), row.password_hash);
  if (!valid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });

  const hash = bcrypt.hashSync(String(new_password), 10);
  await execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, user.id]);
  return NextResponse.json({ ok: true });
}

// Boss-only: reset any user's password without knowing their current one.
export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'boss') return NextResponse.json({ error: 'Only a boss can reset passwords' }, { status: 403 });

  const { user_id, new_password } = (await request.json()) as {
    user_id?: string;
    new_password?: string;
  };
  if (!user_id || !new_password) {
    return NextResponse.json({ error: 'User and new password are required' }, { status: 400 });
  }
  if (String(new_password).length < MIN_LEN) {
    return NextResponse.json({ error: `New password must be at least ${MIN_LEN} characters` }, { status: 400 });
  }

  const target = await queryOne('SELECT id FROM users WHERE id = ?', [String(user_id)]);
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const hash = bcrypt.hashSync(String(new_password), 10);
  await execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, String(user_id)]);
  return NextResponse.json({ ok: true });
}
