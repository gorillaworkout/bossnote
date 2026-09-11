import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NextResponse } from 'next/server';
import {
  COOKIE_NAME,
  SESSION_MAX_AGE,
  clearSessionCookie,
  createSession,
  sessionCookieOptions,
  setSessionCookie,
  toSessionUser,
  verifySessionToken,
  type SessionUser,
} from './auth.ts';

const SAMPLE: SessionUser = {
  id: 'bayu-001',
  email: 'bayu@example.com',
  name: 'Bayu',
  role: 'boss',
};

describe('sessionCookieOptions', () => {
  it('persists 90 days with Max-Age, Expires, httpOnly, and SameSite=Lax', () => {
    const opts = sessionCookieOptions();
    assert.equal(opts.httpOnly, true);
    assert.equal(opts.sameSite, 'lax');
    assert.equal(opts.path, '/');
    assert.equal(opts.maxAge, SESSION_MAX_AGE);
    assert.equal(opts.maxAge, 60 * 60 * 24 * 90);
    assert.equal(opts.priority, 'high');
    assert.ok(opts.expires instanceof Date);
    const delta = opts.expires.getTime() - Date.now();
    assert.ok(Math.abs(delta - SESSION_MAX_AGE * 1000) < 2000);
    assert.equal(opts.secure, process.env.NODE_ENV === 'production');
  });
});

describe('setSessionCookie / clearSessionCookie', () => {
  it('writes Max-Age and Expires on Set-Cookie so the browser does not treat bn_token as a session cookie', () => {
    const res = NextResponse.json({ ok: true });
    setSessionCookie(res, 'test-token');
    const header = res.headers.get('set-cookie') || '';
    assert.match(header, new RegExp(`${COOKIE_NAME}=test-token`));
    assert.match(header, /Max-Age=7776000/i);
    assert.match(header, /Expires=/i);
    assert.match(header, /HttpOnly/i);
    assert.match(header, /Path=\//i);
    assert.match(header, /SameSite=lax/i);
    assert.doesNotMatch(header, /Max-Age=0/i);

    const stored = res.cookies.get(COOKIE_NAME);
    assert.equal(stored?.value, 'test-token');
    assert.equal(stored?.httpOnly, true);
  });

  it('clears bn_token with Max-Age=0 so logout actually expires the cookie', () => {
    const res = NextResponse.json({ ok: true });
    clearSessionCookie(res);
    const header = res.headers.get('set-cookie') || '';
    assert.match(header, new RegExp(`${COOKIE_NAME}=`));
    assert.match(header, /Max-Age=0/i);
  });
});

describe('createSession / verifySessionToken', { concurrency: false }, () => {
  it('round-trips a 90-day JWT and strips extra claims on refresh', async () => {
    const token = await createSession({ ...SAMPLE, role: 'boss' });
    const user = await verifySessionToken(token);
    assert.deepEqual(user, SAMPLE);

    const messy = { ...SAMPLE, role: 'member' as const, exp: 1, iat: 1 } as SessionUser & { exp: number; iat: number };
    assert.deepEqual(toSessionUser(messy), { id: SAMPLE.id, email: SAMPLE.email, name: SAMPLE.name, role: 'member' });
  });

  it('rejects a token after JWT_SECRET changes', async () => {
    const prev = process.env.JWT_SECRET;
    try {
      process.env.JWT_SECRET = 'stable-secret-aaaaaaaa';
      const token = await createSession(SAMPLE);
      process.env.JWT_SECRET = 'rotated-secret-bbbbbbbb';
      assert.equal(await verifySessionToken(token), null);
    } finally {
      if (prev === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = prev;
    }
  });
});
