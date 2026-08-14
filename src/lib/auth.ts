import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { queryOne } from '@/lib/database';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'bossnote-dev-secret-change-in-production');
const COOKIE_NAME = 'bn_token';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: 'boss' | 'member';
}

export async function createSession(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

export async function login(username: string, password: string): Promise<SessionUser | null> {
  const user = await queryOne<{ id: string; email: string; name: string; password_hash: string; role: string }>(
    'SELECT id, email, name, password_hash, role FROM users WHERE LOWER(name) = LOWER(?)',
    [username],
  );
  if (!user) return null;

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as 'boss' | 'member',
  };
}

export async function getUsers(): Promise<SessionUser[]> {
  const rows = await import('@/lib/database').then(m =>
    m.queryAll<{ id: string; email: string; name: string; role: string }>(
      'SELECT id, email, name, role FROM users ORDER BY name',
    ),
  );
  return rows.map(r => ({ id: r.id, email: r.email, name: r.name, role: r.role as 'boss' | 'member' }));
}

export { COOKIE_NAME };
