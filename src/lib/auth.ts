import { cookies } from 'next/headers';
import { queryOne } from '@/lib/database';
import { passwordMatches } from '@/lib/password-match';
import { COOKIE_NAME, toSessionUser, verifySessionToken, type SessionUser } from '@/lib/session';

export { passwordMatches } from '@/lib/password-match';

export type { SessionUser } from '@/lib/session';
export {
  COOKIE_NAME,
  SESSION_MAX_AGE,
  clearSessionCookie,
  clearSessionCookieOptions,
  createSession,
  jwtSecretBytes,
  refreshSessionCookie,
  sessionCookieOptions,
  setSessionCookie,
  toSessionUser,
  verifySessionToken,
} from '@/lib/session';

async function sessionFromUserId(id: string): Promise<SessionUser | null> {
  const row = await queryOne<{
    id: string;
    email: string;
    name: string;
    role: string;
    department_id: string | null;
  }>('SELECT id, email, name, role, department_id FROM users WHERE id = ?', [id]);
  if (!row) return null;
  return toSessionUser(row);
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    const tokenUser = await verifySessionToken(token);
    if (!tokenUser) return null;
    return sessionFromUserId(tokenUser.id);
  } catch {
    return null;
  }
}

export async function login(username: string, password: string): Promise<SessionUser | null> {
  const user = await queryOne<{
    id: string;
    email: string;
    name: string;
    password_hash: string;
    role: string;
    department_id: string | null;
  }>(
    'SELECT id, email, name, password_hash, role, department_id FROM users WHERE LOWER(name) = LOWER(?)',
    [username],
  );
  if (!user) return null;

  const valid = await passwordMatches(typeof password === 'string' ? password : '', user.password_hash);
  if (!valid) return null;

  return toSessionUser({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    department_id: user.department_id,
  });
}

export async function getUsers(): Promise<SessionUser[]> {
  const rows = await import('@/lib/database').then(m =>
    m.queryAll<{ id: string; email: string; name: string; role: string }>(
      'SELECT id, email, name, role FROM users ORDER BY name',
    ),
  );
  return rows.flatMap((r) => {
    const user = toSessionUser({
      id: r.id,
      email: r.email,
      name: r.name,
      role: r.role,
    });
    return user ? [user] : [];
  });
}
