import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { queryAll, queryOne, execute } from '@/lib/database';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const MIN_LEN = 6;

function requireBoss(user: { id: string; role: string } | null) {
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'boss') return NextResponse.json({ error: 'Only a boss can manage users' }, { status: 403 });
  return null;
}

export async function GET() {
  const user = await getSession();
  const denied = requireBoss(user);
  if (denied) return denied;

  const users = await queryAll(
    'SELECT id, email, name, role, created_at FROM users ORDER BY LOWER(name)',
  );
  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const user = await getSession();
  const denied = requireBoss(user);
  if (denied) return denied;

  const { name, password, role } = (await request.json()) as {
    name?: string;
    password?: string;
    role?: string;
  };
  const cleanName = typeof name === 'string' ? name.trim() : '';
  if (!cleanName) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  if (cleanName.length > 60) return NextResponse.json({ error: 'Name is too long' }, { status: 400 });
  if (!password || String(password).length < MIN_LEN) {
    return NextResponse.json({ error: `Password must be at least ${MIN_LEN} characters` }, { status: 400 });
  }
  const cleanRole = role === 'boss' ? 'boss' : 'member';

  // Login is by name (case-insensitive) — enforce uniqueness.
  const existing = await queryOne('SELECT id FROM users WHERE LOWER(name) = LOWER(?)', [cleanName]);
  if (existing) return NextResponse.json({ error: 'That name is already taken' }, { status: 409 });

  // email is UNIQUE NOT NULL but unused for login; derive a safe value.
  const base = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
  let email = `${base}@bossnote.id`;
  const emailTaken = await queryOne('SELECT id FROM users WHERE email = ?', [email]);
  if (emailTaken) email = `${base}-${Date.now().toString(36)}@bossnote.id`;

  const id = uuidv4();
  const hash = bcrypt.hashSync(String(password), 10);
  await execute(
    'INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)',
    [id, email, cleanName, hash, cleanRole],
  );
  await execute(
    'INSERT INTO user_settings (user_id, ai_model) VALUES (?, ?)',
    [id, 'ag/gemini-3-flash-agent'],
  );

  return NextResponse.json(
    { user: { id, email, name: cleanName, role: cleanRole }, ok: true },
    { status: 201 },
  );
}
