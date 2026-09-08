import { NextRequest, NextResponse } from 'next/server';
import { login, createSession, setSessionCookie } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  const user = await login(username, password);
  if (!user) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
  }

  const token = await createSession(user);

  const response = NextResponse.json({ user, ok: true });
  setSessionCookie(response, token);
  return response;
}
