import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_AUDIO_MODEL } from './ai.ts';
import { deriveLoginEmail } from './admin-seed.ts';
import { homePathForRole } from './home-path.ts';
import { normalizeLarkDirectoryEmail, normalizeLarkOpenId, publicBossnoteUrl } from './lark.ts';
import type { LarkLoginErrorCode } from './lark-login-messages.ts';
import { jwtSecretBytes } from './session.ts';

export const LARK_OAUTH_COOKIE = 'bn_lark_oauth';
export const LARK_AUTHORIZE_URL = 'https://accounts.larksuite.com/open-apis/authen/v1/authorize';
export const LARK_LOGIN_SCOPE = 'contact:user.email:readonly';
const DEFAULT_API_BASE = 'https://open.larksuite.com/open-apis';
const NAME_MAX = 60;

export type LarkLoginConfig = {
  appId: string;
  appSecret: string;
  tenantKey: string;
  redirectUri: string;
  apiBase: string;
};

export type LarkOauthCookie = {
  state: string;
  codeVerifier: string;
};

export type LarkLoginUser = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: string;
  department_id: string | null;
  lark_open_id: string | null;
  lark_email: string | null;
  auth_provider: string;
};

export type NewLarkLogin = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: 'member';
  department_id: null;
  lark_open_id: string;
  lark_email: string | null;
  auth_provider: 'lark';
  settingsModel: string;
};

export interface LarkUserStore {
  findAdminByOpenId(openId: string): Promise<LarkLoginUser | null>;
  findLarkByOpenId(openId: string): Promise<LarkLoginUser | null>;
  nameTaken(name: string): Promise<boolean>;
  emailTaken(email: string): Promise<boolean>;
  insertLarkUser(row: NewLarkLogin): Promise<'inserted' | 'conflict'>;
  updateLarkEmail(id: string, larkEmail: string | null): Promise<void>;
}

export type LarkCallbackUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  department_id: string | null;
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function trimEnv(name: string): string {
  return (process.env[name] || '').trim();
}

export function absoluteHttpUrl(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.host || url.username || url.password || url.hash) return null;
  return text;
}

export function readLarkLoginConfig(): LarkLoginConfig | null {
  const appId = trimEnv('LARK_APP_ID');
  const appSecret = trimEnv('LARK_APP_SECRET');
  const tenantKey = trimEnv('LARK_TENANT_KEY');
  const redirectUri = absoluteHttpUrl(trimEnv('LARK_REDIRECT_URI'))
    || absoluteHttpUrl(`${publicBossnoteUrl().replace(/\/+$/, '')}/api/auth/lark/callback`);
  if (!appId || !appSecret || !tenantKey || !redirectUri) return null;
  return {
    appId,
    appSecret,
    tenantKey,
    redirectUri,
    apiBase: (trimEnv('LARK_API_BASE') || DEFAULT_API_BASE).replace(/\/+$/, ''),
  };
}

export function randomUrlToken(): string {
  return randomBytes(32).toString('base64url');
}

export function pkceS256(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function buildLarkAuthorizeUrl(config: LarkLoginConfig, state: string, codeChallenge: string): string {
  const url = new URL(LARK_AUTHORIZE_URL);
  url.searchParams.set('client_id', config.appId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('scope', LARK_LOGIN_SCOPE);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export function larkOauthCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/api/auth/lark';
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth/lark',
    maxAge: 600,
  };
}

export function clearLarkOauthCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/api/auth/lark';
  maxAge: number;
  expires: Date;
} {
  return {
    ...larkOauthCookieOptions(),
    maxAge: 0,
    expires: new Date(0),
  };
}

export async function signLarkOauthCookie(
  input: LarkOauthCookie,
  expiration: string | number = '10m',
): Promise<string> {
  return new SignJWT({ state: input.state, code_verifier: input.codeVerifier })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiration)
    .sign(jwtSecretBytes());
}

export async function readLarkOauthCookie(token: string | undefined): Promise<LarkOauthCookie | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwtSecretBytes());
    if (typeof payload.state !== 'string' || typeof payload.code_verifier !== 'string') return null;
    if (!payload.state || !payload.code_verifier) return null;
    return { state: payload.state, codeVerifier: payload.code_verifier };
  } catch {
    return null;
  }
}

function timingSafeEqualString(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export async function beginLarkLogin(input: {
  sessionRole: string | null;
  config: LarkLoginConfig | null;
}): Promise<{ location: string; cookie: string | null }> {
  if (input.sessionRole) {
    return { location: homePathForRole(input.sessionRole), cookie: null };
  }
  if (!input.config) return { location: '/?lark_error=unavailable', cookie: null };
  const state = randomUrlToken();
  const codeVerifier = randomUrlToken();
  const cookie = await signLarkOauthCookie({ state, codeVerifier });
  return {
    location: buildLarkAuthorizeUrl(input.config, state, pkceS256(codeVerifier)),
    cookie,
  };
}

function clipName(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= NAME_MAX) return trimmed;
  return trimmed.slice(0, NAME_MAX).trimEnd();
}

function withSuffix(base: string, suffix: string): string {
  if (base.length + suffix.length <= NAME_MAX) return base + suffix;
  const room = Math.max(0, NAME_MAX - suffix.length);
  return base.slice(0, room).trimEnd() + suffix;
}

export function larkDisplayNameCandidates(name: unknown, enName: unknown): string[] {
  const primary = typeof name === 'string' ? name.trim() : '';
  const secondary = typeof enName === 'string' ? enName.trim() : '';
  const base = clipName(primary || secondary || 'Lark user') || 'Lark user';
  const candidates = [base, withSuffix(base, ' (Lark)')];
  for (let n = 2; n <= 20; n += 1) candidates.push(withSuffix(base, ` (Lark ${n})`));
  return candidates;
}

function larkEmailValue(email: string | null): string | null {
  return normalizeLarkDirectoryEmail(email);
}

function unusablePasswordHash(): string {
  const secret = randomBytes(32).toString('base64url');
  return bcrypt.hashSync(secret, 10);
}

async function chooseName(store: LarkUserStore, name: string | null, enName: string | null): Promise<string | null> {
  for (const candidate of larkDisplayNameCandidates(name, enName)) {
    if (!(await store.nameTaken(candidate))) return candidate;
  }
  return null;
}

async function chooseEmail(store: LarkUserStore, name: string, now: number): Promise<string | null> {
  const first = deriveLoginEmail(name, false, now);
  if (!(await store.emailTaken(first))) return first;
  for (let i = 0; i < 5; i += 1) {
    const candidate = deriveLoginEmail(name, true, now + i + 1);
    if (!(await store.emailTaken(candidate))) return candidate;
  }
  return null;
}

function sessionFields(user: LarkLoginUser): LarkCallbackUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    department_id: user.department_id,
  };
}

export async function provisionLarkLogin(
  store: LarkUserStore,
  identity: { openId: string; name: string | null; enName: string | null; email: string | null },
  options: { now?: number } = {},
): Promise<{ ok: true; user: LarkLoginUser; created: boolean } | { ok: false; error: 'admin' | 'failed' }> {
  try {
    const admin = await store.findAdminByOpenId(identity.openId);
    if (admin) return { ok: false, error: 'admin' };

    const larkEmail = larkEmailValue(identity.email);
    const existing = await store.findLarkByOpenId(identity.openId);
    if (existing) {
      await store.updateLarkEmail(existing.id, larkEmail);
      return { ok: true, user: { ...existing, lark_email: larkEmail }, created: false };
    }

    const name = await chooseName(store, identity.name, identity.enName);
    if (!name) return { ok: false, error: 'failed' };
    const email = await chooseEmail(store, name, options.now ?? Date.now());
    if (!email) return { ok: false, error: 'failed' };

    const row: NewLarkLogin = {
      id: uuidv4(),
      name,
      email,
      password_hash: unusablePasswordHash(),
      role: 'member',
      department_id: null,
      lark_open_id: identity.openId,
      lark_email: larkEmail,
      auth_provider: 'lark',
      settingsModel: DEFAULT_AUDIO_MODEL,
    };
    const inserted = await store.insertLarkUser(row);
    if (inserted === 'conflict') {
      const winner = await store.findLarkByOpenId(identity.openId);
      if (!winner) return { ok: false, error: 'failed' };
      await store.updateLarkEmail(winner.id, larkEmail);
      return { ok: true, user: { ...winner, lark_email: larkEmail }, created: false };
    }
    return {
      ok: true,
      created: true,
      user: {
        id: row.id,
        email: row.email,
        name: row.name,
        password_hash: row.password_hash,
        role: row.role,
        department_id: null,
        lark_open_id: row.lark_open_id,
        lark_email: row.lark_email,
        auth_provider: 'lark',
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'database error';
    console.warn('[lark-login] provision failed', { message });
    return { ok: false, error: 'failed' };
  }
}

function redirectTo(config: LarkLoginConfig | null, path: string): string {
  if (!config) return path;
  return new URL(path, config.redirectUri).toString();
}

function failure(config: LarkLoginConfig | null, code: LarkLoginErrorCode): { location: string; user: null } {
  return { location: redirectTo(config, `/?lark_error=${code}`), user: null };
}

function larkFailureKind(code: unknown, httpOk: boolean): 'ok' | 'scope' | 'failed' {
  if (code === 20027 || code === '20027' || code === 99991679 || code === '99991679') return 'scope';
  if (!httpOk) return 'failed';
  if (code === 0 || code === '0') return 'ok';
  return 'failed';
}

function logLarkApiFailure(where: string, body: unknown): void {
  const record = body && typeof body === 'object' ? body as { code?: unknown; msg?: unknown } : {};
  const code = typeof record.code === 'number' || typeof record.code === 'string' ? record.code : undefined;
  const msg = typeof record.msg === 'string' ? record.msg.slice(0, 300) : undefined;
  console.warn(`[lark-login] ${where} failed`, { code, msg });
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

export async function runLarkCallback(input: {
  config: LarkLoginConfig | null;
  oauthCookie: string | undefined;
  error: string | null;
  code: string | null;
  state: string | null;
  store: LarkUserStore;
  fetchImpl?: FetchLike;
  now?: number;
}): Promise<{ location: string; user: LarkCallbackUser | null }> {
  if (input.error) {
    return failure(input.config, input.error === 'access_denied' ? 'denied' : 'failed');
  }
  if (!input.config) return failure(null, 'unavailable');

  const cookie = await readLarkOauthCookie(input.oauthCookie);
  if (!cookie || !timingSafeEqualString(cookie.state, input.state ?? '')) {
    return failure(input.config, 'state');
  }
  if (!input.code) return failure(input.config, 'failed');

  const fetchImpl = input.fetchImpl ?? fetch;
  let tokenResponse: Response;
  try {
    tokenResponse = await fetchImpl(`${input.config.apiBase}/authen/v2/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: input.config.appId,
        client_secret: input.config.appSecret,
        code: input.code,
        redirect_uri: input.config.redirectUri,
        code_verifier: cookie.codeVerifier,
      }),
    });
  } catch {
    return failure(input.config, 'failed');
  }

  const tokenBody = await readJson(tokenResponse);
  const tokenCode = tokenBody && typeof tokenBody === 'object' ? (tokenBody as { code?: unknown }).code : undefined;
  const tokenKind = larkFailureKind(tokenCode, tokenResponse.ok);
  if (tokenKind !== 'ok') {
    logLarkApiFailure('token', tokenBody);
    return failure(input.config, tokenKind);
  }
  const accessToken = tokenBody && typeof tokenBody === 'object'
    ? (tokenBody as { access_token?: unknown }).access_token
    : undefined;
  if (typeof accessToken !== 'string' || !accessToken) {
    logLarkApiFailure('token', tokenBody);
    return failure(input.config, 'failed');
  }

  let infoResponse: Response;
  try {
    infoResponse = await fetchImpl(`${input.config.apiBase}/authen/v1/user_info`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    return failure(input.config, 'failed');
  }
  const infoBody = await readJson(infoResponse);
  const infoCode = infoBody && typeof infoBody === 'object' ? (infoBody as { code?: unknown }).code : undefined;
  const infoKind = larkFailureKind(infoCode, infoResponse.ok);
  if (infoKind !== 'ok') {
    logLarkApiFailure('user_info', infoBody);
    return failure(input.config, infoKind);
  }
  const data = infoBody && typeof infoBody === 'object' ? (infoBody as { data?: unknown }).data : null;
  if (!data || typeof data !== 'object') return failure(input.config, 'failed');
  const record = data as { open_id?: unknown; name?: unknown; en_name?: unknown; email?: unknown; tenant_key?: unknown };
  const openId = normalizeLarkOpenId(record.open_id);
  if (!openId) return failure(input.config, 'failed');
  const tenantKey = typeof record.tenant_key === 'string' ? record.tenant_key : '';
  if (tenantKey !== input.config.tenantKey) {
    console.warn('[lark-login] organization rejected', { open_id: openId });
    return failure(input.config, 'org');
  }

  const provisioned = await provisionLarkLogin(input.store, {
    openId,
    name: typeof record.name === 'string' ? record.name : null,
    enName: typeof record.en_name === 'string' ? record.en_name : null,
    email: typeof record.email === 'string' ? record.email : null,
  }, { now: input.now });
  if (!provisioned.ok) {
    if (provisioned.error === 'admin') {
      console.warn('[lark-login] admin rejected', { open_id: openId });
      return failure(input.config, 'admin');
    }
    return failure(input.config, 'failed');
  }
  if (provisioned.user.role === 'admin') {
    console.warn('[lark-login] admin rejected', { open_id: openId });
    return failure(input.config, 'admin');
  }
  return {
    location: redirectTo(input.config, homePathForRole(provisioned.user.role)),
    user: sessionFields(provisioned.user),
  };
}
