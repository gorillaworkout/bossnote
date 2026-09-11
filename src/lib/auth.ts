import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { queryOne } from '@/lib/database';

const COOKIE_NAME = 'bn_token';
const SESSION_MAX_AGE = 60 * 60 * 24 * 90; // 90 days
const DEV_JWT_SECRET = 'bossnote-dev-secret-change-in-production';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: 'boss' | 'member';
}

export type SessionCookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
  expires: Date;
  priority: 'high';
};

/** Dynamic env read — avoids build-time inlining of process.env.JWT_SECRET. */
export function jwtSecretBytes(): Uint8Array {
  const raw = process.env['JWT_SECRET'] || DEV_JWT_SECRET;
  return new TextEncoder().encode(raw);
}

export function toSessionUser(user: SessionUser): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role === 'boss' ? 'boss' : 'member',
  };
}

export function sessionCookieOptions(maxAge = SESSION_MAX_AGE): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
    expires: new Date(Date.now() + maxAge * 1000),
    priority: 'high',
  };
}

export function clearSessionCookieOptions(): SessionCookieOptions {
  return {
    ...sessionCookieOptions(0),
    expires: new Date(0),
  };
}

export async function createSession(user: SessionUser): Promise<string> {
  const session = toSessionUser(user);
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('90d')
    .sign(jwtSecretBytes());
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecretBytes());
    if (typeof payload.id !== 'string' || typeof payload.email !== 'string' || typeof payload.name !== 'string') {
      return null;
    }
    return toSessionUser(payload as unknown as SessionUser);
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    return verifySessionToken(token);
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

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(COOKIE_NAME, token, sessionCookieOptions());
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, '', clearSessionCookieOptions());
}

export async function refreshSessionCookie(response: NextResponse, user: SessionUser) {
  const token = await createSession(user);
  setSessionCookie(response, token);
}

export { COOKIE_NAME, SESSION_MAX_AGE };
