import { NextRequest, NextResponse } from 'next/server';
import { login, createSession, getSession, COOKIE_NAME } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const { email, password } = await request.json();

  const user = await login(email, password);
  if (!user) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const token = await createSession(user);

  const response = NextResponse.json({ user, ok: true });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return response;
}
