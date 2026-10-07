import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getSession } from '@/lib/auth';
import { execute, queryAll, queryOne } from '@/lib/database';
import { DEFAULT_AUDIO_MODEL } from '@/lib/ai';
import { deriveLoginEmail } from '@/lib/admin-seed';
import { validateCreateUser } from '@/lib/managed-user';
import { requireAdmin } from '@/lib/require-admin';

const USER_LIST_SQL = `SELECT u.id, u.email, u.name, u.role, u.department_id, d.name AS department_name,
       u.lark_open_id, u.created_at
FROM users u
LEFT JOIN departments d ON d.id = u.department_id
ORDER BY LOWER(u.name)`;

export async function GET() {
  const denied = requireAdmin(await getSession(), 'Only an admin can manage users');
  if (denied) return denied;

  const users = await queryAll(USER_LIST_SQL);
  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const denied = requireAdmin(await getSession(), 'Only an admin can manage users');
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as {
    name?: unknown;
    password?: unknown;
    role?: unknown;
    department_id?: unknown;
  };
  const parsed = validateCreateUser(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });

  const department = await queryOne('SELECT id FROM departments WHERE id = ?', [parsed.department_id]);
  if (!department) return NextResponse.json({ error: 'Department not found' }, { status: 400 });

  const existing = await queryOne('SELECT id FROM users WHERE LOWER(name) = LOWER(?)', [parsed.name]);
  if (existing) return NextResponse.json({ error: 'That name is already taken' }, { status: 409 });

  const baseEmail = deriveLoginEmail(parsed.name, false);
  const emailTaken = await queryOne('SELECT id FROM users WHERE email = ?', [baseEmail]);
  const email = deriveLoginEmail(parsed.name, Boolean(emailTaken));

  const id = uuidv4();
  const hash = bcrypt.hashSync(parsed.password, 10);
  await execute(
    'INSERT INTO users (id, email, name, password_hash, role, department_id) VALUES (?, ?, ?, ?, ?, ?)',
    [id, email, parsed.name, hash, parsed.role, parsed.department_id],
  );
  await execute(
    'INSERT INTO user_settings (user_id, ai_model) VALUES (?, ?)',
    [id, DEFAULT_AUDIO_MODEL],
  );

  return NextResponse.json(
    {
      user: {
        id,
        email,
        name: parsed.name,
        role: parsed.role,
        department_id: parsed.department_id,
      },
      ok: true,
    },
    { status: 201 },
  );
}
