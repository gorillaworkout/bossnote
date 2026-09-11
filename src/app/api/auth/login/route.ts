import { NextRequest, NextResponse } from 'next/server';
import { login, createSession, setSessionCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, private' };

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  const user = await login(username, password);
  if (!user) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401, headers: NO_STORE });
  }

  const token = await createSession(user);

  const response = NextResponse.json({ user, ok: true }, { headers: NO_STORE });
  setSessionCookie(response, token);
  return response;
}
