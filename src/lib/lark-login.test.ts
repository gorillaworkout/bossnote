import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import { DEFAULT_AUDIO_MODEL } from './ai.ts';
import { deriveLoginEmail } from './admin-seed.ts';
import { NO_DEPARTMENT_CREATE_ERROR } from './assignment.ts';
import { passwordMatches } from './password-match.ts';
import { canViewTask } from './task-access.ts';
import { buildTaskListQuery } from './task-list-scope.ts';
import {
  beginLarkLogin,
  buildLarkAuthorizeUrl,
  LARK_AUTHORIZE_URL,
  LARK_LOGIN_SCOPE,
  larkDisplayNameCandidates,
  larkOauthCookieOptions,
  pkceS256,
  provisionLarkLogin,
  readLarkLoginConfig,
  readLarkOauthCookie,
  runLarkCallback,
  signLarkOauthCookie,
  type LarkLoginConfig,
  type LarkLoginUser,
  type LarkUserStore,
} from './lark-login.ts';
import { larkLoginErrorSentence } from './lark-login-messages.ts';

const ENV_KEYS = [
  'LARK_APP_ID',
  'LARK_APP_SECRET',
  'LARK_TENANT_KEY',
  'LARK_REDIRECT_URI',
  'LARK_API_BASE',
  'LARK_CHAT_ID',
  'BOSSNOTE_URL',
  'APP_URL',
  'NEXT_PUBLIC_APP_URL',
] as const;

const HASH = '$2b$10$RRqvPhkzece5ZEJP/Z5m1eHlBYqeVhaDvIRA2lVbMOnsl2ajRJmCa';

const config: LarkLoginConfig = {
  appId: 'cli_test',
  appSecret: 'secret_test',
  tenantKey: 'tenant_test',
  redirectUri: 'https://bossnote.gorillaworkout.id/api/auth/lark/callback',
  apiBase: 'https://open.larksuite.com/open-apis',
};

function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const prev = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of prev) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function person(partial: Partial<LarkLoginUser> & Pick<LarkLoginUser, 'id' | 'name' | 'role'>): LarkLoginUser {
  return {
    email: `${partial.id}@bossnote.id`,
    password_hash: HASH,
    department_id: partial.role === 'admin' ? null : 'dept-general',
    lark_open_id: null,
    lark_email: null,
    auth_provider: 'password',
    ...partial,
  };
}

function memoryStore(seed: LarkLoginUser[] = []) {
  const rows = seed.map((row) => ({ ...row }));
  const settings = new Map<string, string>();
  let barrier: Promise<void> | null = null;
  let release: (() => void) | null = null;
  let waiting = 0;
  const store: LarkUserStore & { rows: LarkLoginUser[]; settings: Map<string, string>; race: () => void } = {
    rows,
    settings,
    race() {
      waiting = 0;
      barrier = new Promise((resolve) => {
        release = resolve;
      });
    },
    async findAdminByOpenId(openId) {
      return rows.find((row) => row.role === 'admin' && row.lark_open_id === openId) ?? null;
    },
    async findLarkByOpenId(openId) {
      return rows.find((row) => row.auth_provider === 'lark' && row.lark_open_id === openId) ?? null;
    },
    async nameTaken(name) {
      return rows.some((row) => row.name.toLowerCase() === name.toLowerCase());
    },
    async emailTaken(email) {
      return rows.some((row) => row.email === email);
    },
    async updateLarkEmail(id, larkEmail) {
      const row = rows.find((item) => item.id === id);
      if (row) row.lark_email = larkEmail;
    },
    async insertLarkUser(row) {
      if (barrier) {
        waiting += 1;
        if (waiting >= 2) release?.();
        await barrier;
      }
      if (rows.some((item) => item.auth_provider === 'lark' && item.lark_open_id === row.lark_open_id)) {
        return 'conflict';
      }
      rows.push({
        id: row.id,
        email: row.email,
        name: row.name,
        password_hash: row.password_hash,
        role: row.role,
        department_id: row.department_id,
        lark_open_id: row.lark_open_id,
        lark_email: row.lark_email,
        auth_provider: row.auth_provider,
      });
      settings.set(row.id, row.settingsModel);
      return 'inserted';
    },
  };
  return store;
}

function scripted(steps: Array<{ status?: number; body: unknown }>) {
  const seen: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    seen.push({ url, init });
    const step = steps[seen.length - 1] ?? { status: 500, body: { code: 1, msg: 'missing' } };
    return new Response(JSON.stringify(step.body), {
      status: step.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return { fetchImpl, seen };
}

async function withWarnings<T>(run: () => Promise<T>): Promise<{ result: T; warnings: unknown[][] }> {
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };
  try {
    return { result: await run(), warnings };
  } finally {
    console.warn = originalWarn;
  }
}

describe('Lark authorize URL', () => {
  it('sends the S256 challenge and the email scope only', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    assert.equal(pkceS256(verifier), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    const location = buildLarkAuthorizeUrl(config, 'state 1', pkceS256(verifier));
    const url = new URL(location);
    assert.equal(`${url.origin}${url.pathname}`, LARK_AUTHORIZE_URL);
    assert.equal(url.searchParams.get('client_id'), 'cli_test');
    assert.equal(url.searchParams.get('response_type'), 'code');
    assert.equal(url.searchParams.get('redirect_uri'), config.redirectUri);
    assert.equal(url.searchParams.get('scope'), LARK_LOGIN_SCOPE);
    assert.equal(url.searchParams.get('scope'), 'contact:user.email:readonly');
    assert.equal(url.searchParams.get('state'), 'state 1');
    assert.equal(url.searchParams.get('code_challenge'), pkceS256(verifier));
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.has('prompt'), false);
    assert.equal(url.searchParams.has('offline_access'), false);
    assert.equal(location.includes('offline_access'), false);
    assert.equal(location.includes('prompt='), false);
  });
});

describe('readLarkLoginConfig', () => {
  it('requires the app, tenant, and an absolute redirect URI', () => {
    const full = {
      LARK_APP_ID: 'cli_test',
      LARK_APP_SECRET: 'secret_test',
      LARK_TENANT_KEY: 'tenant_test',
      LARK_CHAT_ID: '',
    };
    withEnv({ ...full, LARK_REDIRECT_URI: config.redirectUri, BOSSNOTE_URL: 'https://other.example' }, () => {
      assert.equal(readLarkLoginConfig()?.redirectUri, config.redirectUri);
    });
    withEnv({ ...full, BOSSNOTE_URL: 'https://bossnote.gorillaworkout.id/' }, () => {
      assert.equal(readLarkLoginConfig()?.redirectUri, config.redirectUri);
    });
    withEnv({ ...full, APP_URL: 'https://app.example' }, () => {
      assert.equal(readLarkLoginConfig()?.redirectUri, 'https://app.example/api/auth/lark/callback');
    });
    withEnv({ ...full, NEXT_PUBLIC_APP_URL: 'https://public.example' }, () => {
      assert.equal(readLarkLoginConfig()?.redirectUri, 'https://public.example/api/auth/lark/callback');
    });
    withEnv({ ...full, LARK_REDIRECT_URI: 'not a url', BOSSNOTE_URL: 'https://bossnote.gorillaworkout.id' }, () => {
      assert.equal(readLarkLoginConfig()?.redirectUri, config.redirectUri);
    });
    for (const missing of ['LARK_APP_ID', 'LARK_APP_SECRET', 'LARK_TENANT_KEY'] as const) {
      withEnv({ ...full, BOSSNOTE_URL: 'https://bossnote.gorillaworkout.id', [missing]: '   ' }, () => {
        assert.equal(readLarkLoginConfig(), null);
      });
    }
    withEnv(full, () => {
      assert.equal(readLarkLoginConfig(), null);
    });
  });
});

describe('beginLarkLogin', () => {
  it('sends a signed-in browser home and does not set the Lark cookie', async () => {
    const admin = await beginLarkLogin({ sessionRole: 'admin', config });
    assert.equal(admin.location, '/dashboard/departments');
    assert.equal(admin.cookie, null);
    const member = await beginLarkLogin({ sessionRole: 'member', config: null });
    assert.equal(member.location, '/dashboard');
    assert.equal(member.cookie, null);
  });

  it('stops when Lark login is not configured', async () => {
    const result = await beginLarkLogin({ sessionRole: null, config: null });
    assert.equal(result.location, '/?lark_error=unavailable');
    assert.equal(result.cookie, null);
    const options = larkOauthCookieOptions();
    assert.equal(options.httpOnly, true);
    assert.equal(options.sameSite, 'lax');
    assert.equal(options.path, '/api/auth/lark');
    assert.equal(options.maxAge, 600);
    assert.equal(options.secure, process.env.NODE_ENV === 'production');
  });

  it('builds the authorize redirect from the cookie verifier', async () => {
    const result = await beginLarkLogin({ sessionRole: null, config });
    assert.ok(result.cookie);
    const cookie = await readLarkOauthCookie(result.cookie);
    assert.ok(cookie);
    const url = new URL(result.location);
    assert.equal(url.searchParams.get('state'), cookie.state);
    assert.equal(url.searchParams.get('code_challenge'), pkceS256(cookie.codeVerifier));
    assert.equal(url.searchParams.get('scope'), LARK_LOGIN_SCOPE);
    assert.equal(url.searchParams.has('offline_access'), false);
  });
});

describe('runLarkCallback guards', () => {
  const state = 'state-value';
  const codeVerifier = 'verifier-value';

  async function reject(extra: Partial<Parameters<typeof runLarkCallback>[0]>, callsExpected = 0) {
    let calls = 0;
    const result = await runLarkCallback({
      config,
      oauthCookie: undefined,
      error: null,
      code: 'auth-code',
      state,
      store: memoryStore(),
      fetchImpl: async () => {
        calls += 1;
        throw new Error('Lark should not be called');
      },
      ...extra,
    });
    assert.equal(calls, callsExpected);
    return result;
  }

  it('maps access_denied and a bad state without calling Lark', async () => {
    const denied = await reject({ error: 'access_denied' });
    assert.match(denied.location, /lark_error=denied$/);
    assert.equal(denied.user, null);

    const other = await reject({ error: 'server_error' });
    assert.match(other.location, /lark_error=failed$/);

    const missing = await reject({});
    assert.match(missing.location, /lark_error=state$/);

    const cookie = await signLarkOauthCookie({ state, codeVerifier });
    const tampered = cookie.slice(0, -1) + (cookie.endsWith('a') ? 'b' : 'a');
    const badSig = await reject({ oauthCookie: tampered });
    assert.match(badSig.location, /lark_error=state$/);

    const expired = await signLarkOauthCookie({ state, codeVerifier }, Math.floor(Date.now() / 1000) - 60);
    const old = await reject({ oauthCookie: expired });
    assert.match(old.location, /lark_error=state$/);

    const mismatch = await reject({ oauthCookie: cookie, state: 'other-state' });
    assert.match(mismatch.location, /lark_error=state$/);

    const unavailable = await reject({ config: null, oauthCookie: cookie });
    assert.equal(unavailable.location, '/?lark_error=unavailable');
  });

  it('maps scope errors and other Lark failures', async () => {
    const cookie = await signLarkOauthCookie({ state, codeVerifier });
    for (const code of [20027, '99991679']) {
      const token = scripted([{ status: 400, body: { code, msg: 'scope missing' } }]);
      const result = await runLarkCallback({
        config,
        oauthCookie: cookie,
        error: null,
        code: 'auth-code',
        state,
        store: memoryStore(),
        fetchImpl: token.fetchImpl,
      });
      assert.match(result.location, /lark_error=scope$/);
      assert.equal(result.user, null);
      assert.equal(token.seen.length, 1);
    }

    const infoScope = scripted([
      { body: { code: '0', access_token: 'user-token-secret', refresh_token: 'refresh-secret' } },
      { status: 403, body: { code: 99991679, msg: 'need contact:user.email:readonly' } },
    ]);
    const scoped = await runLarkCallback({
      config,
      oauthCookie: cookie,
      error: null,
      code: 'auth-code',
      state,
      store: memoryStore(),
      fetchImpl: infoScope.fetchImpl,
    });
    assert.match(scoped.location, /lark_error=scope$/);
    assert.equal(JSON.stringify(scoped).includes('user-token-secret'), false);
    assert.equal(JSON.stringify(scoped).includes('refresh-secret'), false);

    const failed = scripted([{ status: 500, body: { code: 20050, msg: 'server_error' } }]);
    const down = await runLarkCallback({
      config,
      oauthCookie: cookie,
      error: null,
      code: 'auth-code',
      state,
      store: memoryStore(),
      fetchImpl: failed.fetchImpl,
    });
    assert.match(down.location, /lark_error=failed$/);
  });
});

describe('Lark provisioning', () => {
  const ian = person({ id: 'boss-001', name: 'Ian', role: 'boss', lark_open_id: 'ou_ian_mention' });
  const bayu = person({
    id: 'bayu-001',
    name: 'Bayu',
    role: 'member',
    lark_open_id: 'ou_bayu_same',
    email: 'bayu@bossnote.id',
  });
  const admin = person({
    id: 'admin-001',
    name: 'Admin',
    role: 'admin',
    department_id: null,
    lark_open_id: 'ou_admin1',
    email: 'admin@bossnote.id',
  });

  it('inserts a separate member and ignores a password row with the same open id', async () => {
    const store = memoryStore([ian, bayu, admin]);
    const beforeBayu = { ...bayu };
    const created = await provisionLarkLogin(store, {
      openId: 'ou_bayu_same',
      name: 'Bayu',
      enName: null,
      email: 'Bayu.Ops@dupoin.co.id',
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.created, true);
    assert.notEqual(created.user.id, 'bayu-001');
    assert.equal(created.user.role, 'member');
    assert.equal(created.user.department_id, null);
    assert.equal(created.user.auth_provider, 'lark');
    assert.equal(created.user.lark_open_id, 'ou_bayu_same');
    assert.equal(created.user.lark_email, 'bayu.ops@dupoin.co.id');
    assert.equal(created.user.email.endsWith('@bossnote.id'), true);
    assert.notEqual(created.user.email, 'bayu.ops@dupoin.co.id');
    assert.equal(store.settings.get(created.user.id), DEFAULT_AUDIO_MODEL);
    assert.equal(await bcrypt.compare('password', created.user.password_hash), false);
    assert.equal(await bcrypt.compare('', created.user.password_hash), false);
    assert.deepEqual(store.rows.find((row) => row.id === 'bayu-001'), beforeBayu);
    assert.equal(store.rows.filter((row) => row.auth_provider === 'lark').length, 1);
  });

  it('renames Ian to Ian (Lark) and does not use the Lark mailbox', async () => {
    const store = memoryStore([ian]);
    const created = await provisionLarkLogin(store, {
      openId: 'ou_ian_lark1',
      name: 'Ian',
      enName: 'Ian',
      email: 'ian@dupoin.com',
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.user.name, 'Ian (Lark)');
    assert.equal(created.user.email, 'ianlark@bossnote.id');
    assert.notEqual(created.user.email, 'ian@dupoin.com');
    assert.notEqual(created.user.id, 'boss-001');
    assert.equal(store.rows.find((row) => row.id === 'boss-001')?.name, 'Ian');
    assert.equal(store.rows.find((row) => row.id === 'boss-001')?.lark_open_id, 'ou_ian_mention');
  });

  it('uses a timestamp email when the plain address is taken', async () => {
    const store = memoryStore([
      ian,
      person({ id: 'taken-email', name: 'Taken', role: 'member', email: 'ianlark@bossnote.id' }),
    ]);
    const created = await provisionLarkLogin(store, {
      openId: 'ou_ian_lark2',
      name: 'Ian',
      enName: null,
      email: null,
    }, { now: 36 });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.user.email, deriveLoginEmail('Ian (Lark)', true, 37));
    assert.match(created.user.email, /^ianlark-[a-z0-9]+@bossnote\.id$/);
    assert.equal(created.user.lark_email, null);
  });

  it('signs in the same Lark row and updates only lark_email', async () => {
    const store = memoryStore([bayu]);
    const first = await provisionLarkLogin(store, {
      openId: 'ou_sari01',
      name: 'Sari',
      enName: null,
      email: 'sari@dupoin.co.id',
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const snapshot = { ...store.rows.find((row) => row.id === first.user.id)! };
    const second = await provisionLarkLogin(store, {
      openId: 'ou_sari01',
      name: 'Changed',
      enName: 'Changed',
      email: 'not-an-email',
    });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.created, false);
    assert.equal(second.user.id, first.user.id);
    assert.equal(second.user.name, 'Sari');
    assert.equal(second.user.lark_email, null);
    const row = store.rows.find((item) => item.id === first.user.id)!;
    assert.equal(row.name, snapshot.name);
    assert.equal(row.email, snapshot.email);
    assert.equal(row.password_hash, snapshot.password_hash);
    assert.equal(row.role, snapshot.role);
    assert.equal(row.department_id, snapshot.department_id);
    assert.equal(row.auth_provider, 'lark');
    assert.equal(store.rows.filter((item) => item.auth_provider === 'lark').length, 1);
  });

  it('refuses an open id stored on the admin and inserts nothing', async () => {
    const store = memoryStore([admin, bayu]);
    const result = await provisionLarkLogin(store, {
      openId: 'ou_admin1',
      name: 'Admin',
      enName: null,
      email: 'admin@dupoin.co.id',
    });
    assert.deepEqual(result, { ok: false, error: 'admin' });
    assert.equal(store.rows.some((row) => row.auth_provider === 'lark'), false);
    assert.equal(store.rows.find((row) => row.id === 'admin-001')?.lark_open_id, 'ou_admin1');
  });

  it('lets two first logins resolve to one row', async () => {
    const store = memoryStore();
    store.race();
    const identity = { openId: 'ou_race01', name: 'Rina', enName: null, email: 'rina@dupoin.co.id' };
    const [left, right] = await Promise.all([
      provisionLarkLogin(store, identity),
      provisionLarkLogin(store, identity),
    ]);
    assert.equal(left.ok, true);
    assert.equal(right.ok, true);
    if (!left.ok || !right.ok) return;
    assert.equal(left.user.id, right.user.id);
    assert.equal(store.rows.filter((row) => row.auth_provider === 'lark').length, 1);
  });

  it('fails when every display name is taken', async () => {
    const taken = larkDisplayNameCandidates('Ian', null).map((name, index) => person({
      id: `taken-${index}`,
      name,
      role: 'member',
      email: `taken${index}@bossnote.id`,
    }));
    const store = memoryStore(taken);
    const result = await provisionLarkLogin(store, {
      openId: 'ou_noname1',
      name: 'Ian',
      enName: null,
      email: 'ian@dupoin.com',
    });
    assert.deepEqual(result, { ok: false, error: 'failed' });
    assert.equal(store.rows.some((row) => row.auth_provider === 'lark'), false);
    for (const candidate of larkDisplayNameCandidates('A very long Lark display name '.repeat(4), null)) {
      assert.ok(candidate.length <= 60, candidate);
    }
  });
});

describe('runLarkCallback provisioning', () => {
  const state = 'state-value';
  const codeVerifier = 'verifier-value';

  it('rejects the wrong organization and an admin open id without a session', async () => {
    const cookie = await signLarkOauthCookie({ state, codeVerifier });
    const store = memoryStore([
      person({
        id: 'admin-001',
        name: 'Admin',
        role: 'admin',
        department_id: null,
        lark_open_id: 'ou_admin1',
      }),
      person({ id: 'bayu-001', name: 'Bayu', role: 'member', lark_open_id: 'ou_bayu_same' }),
    ]);
    const org = scripted([
      { body: { code: '0', access_token: 'user-token-secret', refresh_token: 'refresh-secret' } },
      { body: { code: 0, data: { open_id: 'ou_outsider', name: 'Ian', email: 'ian@dupoin.com', tenant_key: 'other-tenant' } } },
    ]);
    const wrongOrg = await runLarkCallback({
      config,
      oauthCookie: cookie,
      error: null,
      code: 'auth-code',
      state,
      store,
      fetchImpl: org.fetchImpl,
    });
    assert.match(wrongOrg.location, /lark_error=org$/);
    assert.equal(wrongOrg.user, null);
    assert.equal(store.rows.some((row) => row.auth_provider === 'lark'), false);
    const tokenBody = JSON.parse(String(org.seen[0]?.init?.body));
    assert.equal(tokenBody.scope, undefined);
    assert.equal(tokenBody.code_verifier, codeVerifier);
    assert.equal(tokenBody.redirect_uri, config.redirectUri);
    assert.equal(org.seen[0]?.url, `${config.apiBase}/authen/v2/oauth/token`);

    const adminFetch = scripted([
      { body: { code: 0, access_token: 'user-token-secret' } },
      { body: { code: 0, data: { open_id: 'ou_admin1', name: 'Admin', tenant_key: 'tenant_test' } } },
    ]);
    const admin = await runLarkCallback({
      config,
      oauthCookie: cookie,
      error: null,
      code: 'auth-code',
      state,
      store,
      fetchImpl: adminFetch.fetchImpl,
    });
    assert.match(admin.location, /lark_error=admin$/);
    assert.equal(admin.user, null);
    assert.equal(JSON.stringify(admin).includes('user-token-secret'), false);
    assert.equal(store.rows.some((row) => row.auth_provider === 'lark'), false);
  });

  it('creates a member session and does not select Bayu', async () => {
    const cookie = await signLarkOauthCookie({ state, codeVerifier });
    const store = memoryStore([
      person({ id: 'bayu-001', name: 'Bayu', role: 'member', lark_open_id: 'ou_bayu_same', email: 'bayu@bossnote.id' }),
    ]);
    const before = { ...store.rows[0] };
    const ok = scripted([
      { body: { code: '0', access_token: 'user-token-secret', refresh_token: 'refresh-secret' } },
      {
        body: {
          code: 0,
          data: {
            open_id: 'ou_bayu_same',
            name: 'Bayu',
            en_name: 'Bayu',
            email: 'bayu.ops@dupoin.co.id',
            tenant_key: 'tenant_test',
          },
        },
      },
    ]);
    const result = await runLarkCallback({
      config,
      oauthCookie: cookie,
      error: null,
      code: 'auth-code',
      state,
      store,
      fetchImpl: ok.fetchImpl,
    });
    assert.equal(result.location, 'https://bossnote.gorillaworkout.id/dashboard');
    assert.ok(result.user);
    assert.notEqual(result.user?.id, 'bayu-001');
    assert.equal(result.user?.role, 'member');
    assert.equal(result.user?.department_id, null);
    assert.equal(JSON.stringify(result).includes('user-token-secret'), false);
    assert.equal(JSON.stringify(result).includes('refresh-secret'), false);
    assert.equal(JSON.stringify(result).includes('secret_test'), false);
    assert.deepEqual(store.rows.find((row) => row.id === 'bayu-001'), before);
    assert.equal(result.user && 'password_hash' in result.user, false);
  });
});

describe('Lark tenant resolution', () => {
  const state = 'state-value';
  const codeVerifier = 'verifier-value';
  const lengths = (openId: string, envTenantLen: number, userInfoTenantLen: number, tokenTenantLen: number) => ({
    open_id: openId,
    envTenantLen,
    userInfoTenantLen,
    tokenTenantLen,
  });

  async function callback(options: {
    tenantKey?: string;
    token?: Record<string, unknown>;
    user?: Record<string, unknown>;
  }) {
    const cookie = await signLarkOauthCookie({ state, codeVerifier });
    const store = memoryStore();
    const fetch = scripted([
      {
        body: {
          code: 0,
          access_token: 'user-token-secret',
          ...options.token,
        },
      },
      {
        body: {
          code: 0,
          data: {
            open_id: 'ou_member1',
            name: 'Rina',
            email: 'rina@dupoin.co.id',
            ...options.user,
          },
        },
      },
    ]);
    const captured = await withWarnings(() => runLarkCallback({
      config: { ...config, tenantKey: options.tenantKey ?? config.tenantKey },
      oauthCookie: cookie,
      error: null,
      code: 'auth-code',
      state,
      store,
      fetchImpl: fetch.fetchImpl,
    }));
    return { ...captured, store };
  }

  it('matches a trimmed user_info tenant to a trimmed env tenant', async () => {
    const { result, warnings, store } = await callback({
      tenantKey: '  tenant_test',
      user: { tenant_key: 'tenant_test  ' },
    });
    assert.equal(result.location, 'https://bossnote.gorillaworkout.id/dashboard');
    assert.equal(result.user?.role, 'member');
    assert.equal(store.rows.some((row) => row.auth_provider === 'lark'), true);
    assert.equal(warnings.some((args) => String(args[0]).includes('organization rejected')), false);
    assert.equal(JSON.stringify(warnings).includes('tenant_test'), false);
  });

  it('rejects a different organization and logs lengths only', async () => {
    const { result, warnings, store } = await callback({
      token: { tenant_key: 'tenant_test' },
      user: { tenant_key: 'other-tenant' },
    });
    assert.match(result.location, /lark_error=org$/);
    assert.equal(result.user, null);
    assert.equal(store.rows.some((row) => row.auth_provider === 'lark'), false);
    assert.deepEqual(warnings, [[
      '[lark-login] organization rejected',
      lengths('ou_member1', 'tenant_test'.length, 'other-tenant'.length, 'tenant_test'.length),
    ]]);
    const logged = JSON.stringify(warnings);
    assert.equal(logged.includes('other-tenant'), false);
    assert.equal(logged.includes('tenant_test'), false);
    assert.equal(logged.includes('user-token-secret'), false);
  });

  it('uses the oauth token tenant when user_info tenant is empty', async () => {
    const { result, warnings, store } = await callback({
      token: { tenant_key: '  tenant_test  ' },
      user: { tenant_key: '' },
    });
    assert.equal(result.location, 'https://bossnote.gorillaworkout.id/dashboard');
    assert.equal(result.user?.role, 'member');
    assert.equal(store.rows.some((row) => row.auth_provider === 'lark'), true);
    assert.equal(warnings.some((args) => String(args[0]).includes('organization rejected')), false);
    assert.equal(JSON.stringify(warnings).includes('tenant_test'), false);
  });

  it('returns org and logs missing_tenant when both tenants are empty', async () => {
    const { result, warnings, store } = await callback({
      user: { tenant_key: '   ' },
    });
    assert.match(result.location, /lark_error=org$/);
    assert.equal(result.user, null);
    assert.equal(store.rows.some((row) => row.auth_provider === 'lark'), false);
    assert.deepEqual(warnings, [[
      '[lark-login] missing_tenant',
      lengths('ou_member1', 'tenant_test'.length, 0, 0),
    ]]);
    assert.equal(JSON.stringify(warnings).includes('tenant_test'), false);
  });
});

describe('null department access', () => {
  it('hides tasks and blocks create until a department is assigned', () => {
    const member = { id: 'lark-1', role: 'member', department_id: null };
    const query = buildTaskListQuery({ user: member, scope: 'all', assignee: 'boss-001', status: 'todo', search: 'ian' });
    assert.match(query.sql, /FALSE/);
    assert.equal(query.values.includes('boss-001'), false);
    assert.equal(canViewTask(member, {
      assignee_id: 'lark-1',
      created_by: 'boss-001',
      creator_role: 'boss',
      creator_department_id: 'dept-general',
      assignee_role: 'member',
      assignee_department_id: null,
    }), false);
    assert.equal(NO_DEPARTMENT_CREATE_ERROR, 'An admin must assign your department before you can create tasks.');
  });
});

describe('password login still rejects a Lark hash', () => {
  it('treats a bcrypt exception as a mismatch', async () => {
    assert.equal(await passwordMatches('password', 'not-a-hash'), false);
    const hash = bcrypt.hashSync('discarded-secret', 10);
    assert.equal(await passwordMatches('password', hash), false);
    assert.equal(await passwordMatches('', hash), false);
    assert.equal(await passwordMatches('discarded-secret', hash), true);
  });
});

describe('Lark login copy', () => {
  it('maps every error code and hides unknown query values', () => {
    assert.equal(larkLoginErrorSentence('denied'), 'Lark sign-in was cancelled.');
    assert.equal(larkLoginErrorSentence('state'), 'Lark sign-in expired. Try again.');
    assert.equal(larkLoginErrorSentence('org'), 'This Lark account is not in the BossNote organization.');
    assert.equal(larkLoginErrorSentence('admin'), 'The admin account signs in with a password.');
    assert.equal(larkLoginErrorSentence('unavailable'), 'Lark sign-in is not available.');
    assert.equal(larkLoginErrorSentence('scope'), 'Lark did not grant the permissions BossNote needs.');
    assert.equal(larkLoginErrorSentence('failed'), 'Lark sign-in failed. Try again or use your password.');
    assert.equal(larkLoginErrorSentence('<script>'), 'Lark sign-in failed. Try again or use your password.');
    assert.equal(larkLoginErrorSentence(''), '');
    const example = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');
    assert.match(example, /^LARK_TENANT_KEY=$/m);
    assert.match(example, /^LARK_REDIRECT_URI=$/m);
    assert.match(example, /https:\/\/bossnote\.gorillaworkout\.id\/api\/auth\/lark\/callback/);
  });
});
