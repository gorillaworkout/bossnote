import { NextRequest, NextResponse } from 'next/server';
import { createSession, setSessionCookie } from '@/lib/auth';
import {
  clearLarkOauthCookieOptions,
  LARK_OAUTH_COOKIE,
  readLarkLoginConfig,
  runLarkCallback,
} from '@/lib/lark-login';
import { createPgLarkUserStore } from '@/lib/lark-login-store';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const result = await runLarkCallback({
    config: readLarkLoginConfig(),
    oauthCookie: request.cookies.get(LARK_OAUTH_COOKIE)?.value,
    error: url.searchParams.get('error'),
    code: url.searchParams.get('code'),
    state: url.searchParams.get('state'),
    store: createPgLarkUserStore(),
  });
  const location = result.location.startsWith('http')
    ? result.location
    : new URL(result.location, request.url).toString();
  const response = NextResponse.redirect(location);
  response.cookies.set(LARK_OAUTH_COOKIE, '', clearLarkOauthCookieOptions());
  if (result.user && result.user.role !== 'admin') {
    const token = await createSession(result.user);
    setSessionCookie(response, token);
  }
  return response;
}
