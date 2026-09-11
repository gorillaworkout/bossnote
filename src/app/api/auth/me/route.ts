import { NextResponse } from 'next/server';
import { getSession, refreshSessionCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, private' };

export async function GET() {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401, headers: NO_STORE });
  }
  const response = NextResponse.json({ user }, { headers: NO_STORE });
  await refreshSessionCookie(response, user);
  return response;
}
