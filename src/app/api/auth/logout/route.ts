import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json({ ok: true }, {
    headers: { 'Cache-Control': 'no-store, private' },
  });
  clearSessionCookie(response);
  return response;
}

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/', request.url));
  response.headers.set('Cache-Control', 'no-store, private');
  clearSessionCookie(response);
  return response;
}
