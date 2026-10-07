import { SignJWT, jwtVerify } from 'jose';
import { isAppRole, type AppRole } from './roles.ts';

const COOKIE_NAME = 'bn_token';
const SESSION_MAX_AGE = 60 * 60 * 24 * 90; // 90 days
const DEV_JWT_SECRET = 'bossnote-dev-secret-change-in-production';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  department_id: string | null;
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

export type CookieMutableResponse = {
  cookies: {
    set: (name: string, value: string, options: SessionCookieOptions) => unknown;
  };
  headers: { get: (name: string) => string | null };
};

/** Dynamic env read — avoids build-time inlining of process.env.JWT_SECRET. */
export function jwtSecretBytes(): Uint8Array {
  const raw = process.env['JWT_SECRET'] || DEV_JWT_SECRET;
  return new TextEncoder().encode(raw);
}

export function toSessionUser(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  department_id?: string | null;
}): SessionUser | null {
  if (!isAppRole(user.role)) return null;
  if (!user.id || !user.email || !user.name) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    department_id: user.role === 'admin' ? null : (user.department_id ?? null),
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

export async function createSession(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  department_id?: string | null;
}): Promise<string> {
  const session = toSessionUser(user);
  if (!session) throw new Error('Unknown role');
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
    const role = typeof payload.role === 'string' ? payload.role : '';
    const departmentId = typeof payload.department_id === 'string' || payload.department_id === null
      ? payload.department_id
      : null;
    return toSessionUser({
      id: payload.id,
      email: payload.email,
      name: payload.name,
      role,
      department_id: departmentId,
    });
  } catch {
    return null;
  }
}

export function setSessionCookie(response: CookieMutableResponse, token: string) {
  response.cookies.set(COOKIE_NAME, token, sessionCookieOptions());
}

export function clearSessionCookie(response: CookieMutableResponse) {
  response.cookies.set(COOKIE_NAME, '', clearSessionCookieOptions());
}

export async function refreshSessionCookie(response: CookieMutableResponse, user: SessionUser) {
  const token = await createSession(user);
  setSessionCookie(response, token);
}

export { COOKIE_NAME, SESSION_MAX_AGE };
