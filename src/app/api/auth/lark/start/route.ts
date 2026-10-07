import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  beginLarkLogin,
  LARK_OAUTH_COOKIE,
  larkOauthCookieOptions,
  readLarkLoginConfig,
} from '@/lib/lark-login';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getSession();
  const result = await beginLarkLogin({
    sessionRole: session?.role ?? null,
    config: readLarkLoginConfig(),
  });
  const location = result.location.startsWith('http')
    ? result.location
    : new URL(result.location, request.url).toString();
  const response = NextResponse.redirect(location);
  if (result.cookie) {
    response.cookies.set(LARK_OAUTH_COOKIE, result.cookie, larkOauthCookieOptions());
  }
  return response;
}
