import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAssigneeDmText,
  buildTaskNotifyText,
  formatLarkMention,
  getTenantToken,
  isLarkConfigured,
  lookupLarkOpenIdByEmail,
  matchOpenIdByPersonName,
  normalizeLarkOpenId,
  notifyLarkTaskAsync,
  parseLarkEmailMap,
  parseLarkOpenIdMap,
  resetLarkStateForTests,
  resolveAssigneeLarkEmail,
  resolveAssigneeOpenId,
  sendGroupText,
  sendUserText,
} from './lark.ts';

const originalFetch = globalThis.fetch;
const savedEnv = {
  LARK_APP_ID: process.env.LARK_APP_ID,
  LARK_APP_SECRET: process.env.LARK_APP_SECRET,
  LARK_CHAT_ID: process.env.LARK_CHAT_ID,
  LARK_API_BASE: process.env.LARK_API_BASE,
  LARK_OPEN_IDS: process.env.LARK_OPEN_IDS,
  LARK_ASSIGNEE_EMAILS: process.env.LARK_ASSIGNEE_EMAILS,
  BOSSNOTE_URL: process.env.BOSSNOTE_URL,
  APP_URL: process.env.APP_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
};

function restoreEnv(): void {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  globalThis.fetch = originalFetch;
  resetLarkStateForTests();
}

afterEach(restoreEnv);

function setLarkEnv(): void {
  process.env.LARK_APP_ID = 'cli_test';
  process.env.LARK_APP_SECRET = 'secret_test';
  process.env.LARK_CHAT_ID = 'oc_test_chat';
  process.env.LARK_API_BASE = 'https://open.larksuite.com/open-apis';
  delete process.env.BOSSNOTE_URL;
  delete process.env.APP_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;
}

function clearLarkEnv(): void {
  delete process.env.LARK_APP_ID;
  delete process.env.LARK_APP_SECRET;
  delete process.env.LARK_CHAT_ID;
  delete process.env.LARK_API_BASE;
}

type FetchCall = { url: string; init?: RequestInit };

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  return calls;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('buildTaskNotifyText', () => {
  it('formats an English new-task message and appends a known URL', () => {
    process.env.BOSSNOTE_URL = 'https://bossnote.example';
    const text = buildTaskNotifyText({
      title: 'Review deck',
      creatorName: 'Bayu',
      creatorId: 'bayu-001',
      assigneeName: 'Ian',
      priority: 'high',
    });
    assert.equal(
      text,
      'New task: Review deck\nFrom: Bayu\nAssignee: Ian\nPriority: high\nhttps://bossnote.example',
    );
  });

  it('uses reassign heading and medium when priority is missing', () => {
    delete process.env.BOSSNOTE_URL;
    delete process.env.APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    const text = buildTaskNotifyText({
      title: 'Follow up vendor',
      creatorName: 'Sandra',
      assigneeName: 'Bayu',
      kind: 'reassign',
    });
    assert.equal(
      text,
      'Task reassigned: Follow up vendor\nFrom: Sandra\nAssignee: Bayu\nPriority: medium',
    );
  });

  it('falls back to Unknown when creator or assignee name is blank', () => {
    delete process.env.BOSSNOTE_URL;
    delete process.env.APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    const text = buildTaskNotifyText({
      title: '  ',
      creatorName: '  ',
      assigneeName: '',
    });
    assert.equal(text, 'New task: Untitled task\nFrom: Unknown\nAssignee: Unknown\nPriority: medium');
  });

  it('appends a task link when a task id is present', () => {
    process.env.BOSSNOTE_URL = 'https://bossnote.example/';
    const text = buildTaskNotifyText({
      title: 'Fix login',
      creatorName: 'Bayu',
      assigneeName: 'Ian',
      assigneeOpenId: 'ou_ian',
      taskId: 'task 1',
      priority: 'high',
    });
    assert.match(text, /Assignee: <at user_id="ou_ian">Ian<\/at>/);
    assert.match(text, /https:\/\/bossnote\.example\/dashboard\?task=task%201$/);
  });

  it('tags the assignee with the official text @mention when an open_id is known', () => {
    delete process.env.BOSSNOTE_URL;
    delete process.env.APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    const text = buildTaskNotifyText({
      title: 'Review deck',
      creatorName: 'Bayu',
      assigneeName: 'Ian',
      assigneeOpenId: 'ou_ian_open',
      priority: 'high',
    });
    assert.equal(
      text,
      'New task: Review deck\nFrom: Bayu\nAssignee: <at user_id="ou_ian_open">Ian</at>\nPriority: high',
    );
  });
});

describe('buildAssigneeDmText', () => {
  it('writes a short new-task reminder and a task link', () => {
    process.env.BOSSNOTE_URL = 'https://bossnote.example/';
    const text = buildAssigneeDmText({
      title: 'Review deck',
      creatorName: 'Bayu',
      assigneeName: 'Ian',
      assigneeOpenId: 'ou_ian',
      taskId: 'task 1',
      priority: 'high',
    });
    assert.equal(
      text,
      'New task for you: Review deck\nFrom: Bayu\nPriority: high\nhttps://bossnote.example/dashboard?task=task%201',
    );
    assert.doesNotMatch(text, /Assignee:/);
    assert.doesNotMatch(text, /<at /);
  });

  it('uses a reassign heading and omits the link when no public URL is set', () => {
    delete process.env.BOSSNOTE_URL;
    delete process.env.APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    const text = buildAssigneeDmText({
      title: 'Follow up vendor',
      creatorName: 'Sandra',
      assigneeName: 'Bayu',
      kind: 'reassign',
    });
    assert.equal(text, 'Task reassigned to you: Follow up vendor\nFrom: Sandra\nPriority: medium');
  });
});

describe('formatLarkMention / normalizeLarkOpenId / parseLarkOpenIdMap', () => {
  it('builds the official at tag and rejects all / junk ids', () => {
    assert.equal(formatLarkMention('Ian', 'ou_abc123'), '<at user_id="ou_abc123">Ian</at>');
    assert.equal(formatLarkMention('Ian', 'all'), 'Ian');
    assert.equal(formatLarkMention('Ian', 'not a valid id'), 'Ian');
    assert.equal(normalizeLarkOpenId('all'), null);
    assert.equal(normalizeLarkOpenId('ou_ok_1'), 'ou_ok_1');
  });

  it('parses JSON and comma maps by name or BossNote user id', () => {
    const json = parseLarkOpenIdMap('{"Bayu":"ou_bayu","boss-001":"ou_ian"}');
    assert.equal(json.get('bayu'), 'ou_bayu');
    assert.equal(json.get('boss-001'), 'ou_ian');

    const csv = parseLarkOpenIdMap('Bayu:ou_bayu, Ian=ou_ian');
    assert.equal(csv.get('bayu'), 'ou_bayu');
    assert.equal(csv.get('ian'), 'ou_ian');
    assert.equal(parseLarkOpenIdMap('').size, 0);
    assert.equal(parseLarkOpenIdMap('{not-json').size, 0);
  });

  it('parses an assignee email map and drops values that are not emails', () => {
    const json = parseLarkEmailMap(
      '{"boss-001":"ian@dupoin.com","Sandra":"alessandra.jovita@dupoin.co.id","nope":"not-an-email","blank":"  "}',
    );
    assert.equal(json.get('boss-001'), 'ian@dupoin.com');
    assert.equal(json.get('sandra'), 'alessandra.jovita@dupoin.co.id');
    assert.equal(json.has('nope'), false);
    assert.equal(json.has('blank'), false);

    const csv = parseLarkEmailMap('prista-001:prista.regina@dupoin.co.id, Bayu=bayu.ops@dupoin.co.id');
    assert.equal(csv.get('prista-001'), 'prista.regina@dupoin.co.id');
    assert.equal(csv.get('bayu'), 'bayu.ops@dupoin.co.id');
    assert.equal(parseLarkEmailMap('').size, 0);
    assert.equal(parseLarkEmailMap('{not-json').size, 0);
  });
});

describe('resolveAssigneeLarkEmail', () => {
  it('uses Dupoin directory emails for Ian, Sandra, and Prista', () => {
    delete process.env.LARK_ASSIGNEE_EMAILS;
    assert.equal(
      resolveAssigneeLarkEmail({ assigneeId: 'boss-001', assigneeName: 'Ian', assigneeEmail: 'ian@bossnote.id' }),
      'ian@dupoin.com',
    );
    assert.equal(resolveAssigneeLarkEmail({ assigneeName: 'Boss' }), 'ian@dupoin.com');
    assert.equal(
      resolveAssigneeLarkEmail({ assigneeId: 'sandra-001', assigneeName: 'Sandra' }),
      'alessandra.jovita@dupoin.co.id',
    );
    assert.equal(
      resolveAssigneeLarkEmail({ assigneeName: 'Alessandra' }),
      'alessandra.jovita@dupoin.co.id',
    );
    assert.equal(
      resolveAssigneeLarkEmail({ assigneeId: 'prista-001', assigneeName: 'Prista' }),
      'prista.regina@dupoin.co.id',
    );
    assert.equal(resolveAssigneeLarkEmail({ assigneeId: 'bayu-001', assigneeName: 'Bayu' }), null);
    assert.equal(
      resolveAssigneeLarkEmail({ assigneeId: 'bayu-001', assigneeEmail: 'bayu.ops@dupoin.co.id' }),
      'bayu.ops@dupoin.co.id',
    );
  });

  it('lets LARK_ASSIGNEE_EMAILS override one person without dropping the defaults', () => {
    process.env.LARK_ASSIGNEE_EMAILS = '{"bayu-001":"bayu.ops@dupoin.co.id","boss-001":"ian.other@dupoin.com"}';
    assert.equal(
      resolveAssigneeLarkEmail({ assigneeId: 'bayu-001', assigneeName: 'Bayu' }),
      'bayu.ops@dupoin.co.id',
    );
    assert.equal(resolveAssigneeLarkEmail({ assigneeId: 'boss-001' }), 'ian.other@dupoin.com');
    assert.equal(
      resolveAssigneeLarkEmail({ assigneeId: 'prista-001' }),
      'prista.regina@dupoin.co.id',
    );
  });
});

describe('sendGroupText / getTenantToken', () => {
  it('no-ops without throwing when Lark env is missing (logs once)', async () => {
    clearLarkEnv();
    const calls = mockFetch(() => {
      throw new Error('fetch should not be called');
    });
    const warns: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warns.push(args.map(String).join(' '));
    };
    try {
      assert.equal(isLarkConfigured(), false);
      assert.equal(await sendGroupText('hello'), false);
      assert.equal(await sendGroupText('again'), false);
      assert.equal(await getTenantToken(), null);
      assert.equal(calls.length, 0);
      assert.equal(warns.length, 1);
      assert.match(warns[0], /LARK_APP_ID/);
    } finally {
      console.warn = originalWarn;
    }
  });

  it('fetches a tenant token then posts group text', async () => {
    setLarkEnv();
    const calls = mockFetch((url) => {
      if (url.includes('/auth/v3/tenant_access_token/internal')) {
        return jsonResponse({ code: 0, msg: 'ok', tenant_access_token: 't-abc', expire: 7200 });
      }
      if (url.includes('/im/v1/messages')) {
        return jsonResponse({ code: 0, msg: 'ok', data: { message_id: 'om_1' } });
      }
      return jsonResponse({ code: 1, msg: `unexpected ${url}` }, 404);
    });

    const ok = await sendGroupText('New task: Review deck\nAssignee: Ian\nPriority: high');
    assert.equal(ok, true);
    assert.equal(calls.length, 2);

    const tokenCall = calls[0];
    assert.equal(tokenCall.url, 'https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal');
    assert.equal(tokenCall.init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(tokenCall.init?.body)), {
      app_id: 'cli_test',
      app_secret: 'secret_test',
    });

    const msgCall = calls[1];
    assert.equal(
      msgCall.url,
      'https://open.larksuite.com/open-apis/im/v1/messages?receive_id_type=chat_id',
    );
    assert.match(String(msgCall.init?.headers && (msgCall.init.headers as Record<string, string>).Authorization), /Bearer t-abc/);
    const body = JSON.parse(String(msgCall.init?.body)) as {
      receive_id: string;
      msg_type: string;
      content: string;
    };
    assert.equal(body.receive_id, 'oc_test_chat');
    assert.equal(body.msg_type, 'text');
    assert.deepEqual(JSON.parse(body.content), {
      text: 'New task: Review deck\nAssignee: Ian\nPriority: high',
    });

    // Cached token — second send only hits messages.
    const ok2 = await sendGroupText('second');
    assert.equal(ok2, true);
    assert.equal(calls.length, 3);
    assert.match(calls[2].url, /im\/v1\/messages/);
  });

  it('returns false (does not throw) when fetch rejects', async () => {
    setLarkEnv();
    mockFetch(() => {
      throw new Error('network down');
    });
    assert.equal(await sendGroupText('hello'), false);
  });
});

describe('resolveAssigneeOpenId / notifyLarkTaskAsync', () => {
  it('prefers a stored open_id and skips directory lookup', async () => {
    setLarkEnv();
    process.env.LARK_OPEN_IDS = 'Ian:ou_from_env';
    const calls = mockFetch(() => {
      throw new Error('fetch should not be called');
    });
    const id = await resolveAssigneeOpenId({
      assigneeId: 'boss-001',
      assigneeName: 'Ian',
      assigneeOpenId: 'ou_stored',
    });
    assert.equal(id, 'ou_stored');
    assert.equal(calls.length, 0);
  });

  it('uses LARK_OPEN_IDS before an email directory lookup', async () => {
    setLarkEnv();
    delete process.env.LARK_ASSIGNEE_EMAILS;
    process.env.LARK_OPEN_IDS = 'boss-001:ou_from_env';
    const calls = mockFetch((url) => {
      if (url.includes('/contact/v3/users/batch_get_id')) {
        return jsonResponse({
          code: 0,
          data: { user_list: [{ email: 'ian@dupoin.com', user_id: 'ou_from_email' }] },
        });
      }
      return jsonResponse({ code: 0, tenant_access_token: 't-abc', expire: 7200 });
    });
    assert.equal(
      await resolveAssigneeOpenId({ assigneeId: 'boss-001', assigneeName: 'Ian', assigneeEmail: 'ian@bossnote.id' }),
      'ou_from_env',
    );
    assert.equal(calls.filter((c) => c.url.includes('batch_get_id')).length, 0);
  });

  it('resolves a Dupoin email through contact batch_get_id before chat members', async () => {
    setLarkEnv();
    delete process.env.LARK_OPEN_IDS;
    delete process.env.LARK_ASSIGNEE_EMAILS;
    const calls = mockFetch((url, init) => {
      if (url.includes('/auth/v3/tenant_access_token/internal')) {
        return jsonResponse({ code: 0, msg: 'ok', tenant_access_token: 't-abc', expire: 7200 });
      }
      if (url.includes('/contact/v3/users/batch_get_id')) {
        const body = JSON.parse(String(init?.body)) as { emails?: string[] };
        assert.deepEqual(body.emails, ['alessandra.jovita@dupoin.co.id']);
        return jsonResponse({
          code: 0,
          msg: 'success',
          data: {
            user_list: [{ email: 'alessandra.jovita@dupoin.co.id', user_id: 'ou_sandra_email' }],
          },
        });
      }
      if (url.includes('/members')) {
        return jsonResponse({
          code: 0,
          data: { items: [{ member_id: 'ou_sandra_chat', name: 'Sandra' }], has_more: false },
        });
      }
      return jsonResponse({ code: 1, msg: `unexpected ${url}` }, 404);
    });

    const id = await resolveAssigneeOpenId({
      assigneeId: 'sandra-001',
      assigneeName: 'Sandra',
      assigneeEmail: 'sandra@bossnote.id',
    });
    assert.equal(id, 'ou_sandra_email');
    const lookup = calls.find((c) => c.url.includes('/contact/v3/users/batch_get_id'));
    assert.ok(lookup);
    assert.match(lookup.url, /user_id_type=open_id/);
    assert.equal(lookup.init?.method, 'POST');
    assert.match(
      String(lookup.init?.headers && (lookup.init.headers as Record<string, string>).Authorization),
      /Bearer t-abc/,
    );
    assert.equal(calls.filter((c) => c.url.includes('/members')).length, 0);
  });

  it('falls through to chat members when email lookup misses, and never throws when it fails', async () => {
    setLarkEnv();
    delete process.env.LARK_OPEN_IDS;
    delete process.env.LARK_ASSIGNEE_EMAILS;
    mockFetch((url) => {
      if (url.includes('/auth/v3/tenant_access_token/internal')) {
        return jsonResponse({ code: 0, msg: 'ok', tenant_access_token: 't-abc', expire: 7200 });
      }
      if (url.includes('/contact/v3/users/batch_get_id')) {
        return jsonResponse({
          code: 0,
          data: { user_list: [{ email: 'ian@dupoin.com', user_id: '' }] },
        });
      }
      if (url.includes('/members')) {
        return jsonResponse({
          code: 0,
          data: { items: [{ member_id: 'ou_ian_chat', name: 'Ian' }], has_more: false },
        });
      }
      return jsonResponse({ code: 1, msg: `unexpected ${url}` }, 404);
    });
    assert.equal(
      await resolveAssigneeOpenId({ assigneeId: 'boss-001', assigneeName: 'Ian' }),
      'ou_ian_chat',
    );

    resetLarkStateForTests();
    mockFetch(() => {
      throw new Error('network down');
    });
    assert.equal(await lookupLarkOpenIdByEmail('ian@dupoin.com'), null);
    assert.equal(await resolveAssigneeOpenId({ assigneeId: 'boss-001', assigneeName: 'Ian' }), null);
  });

  it('DMs the assignee when only the Dupoin email lookup resolves an open_id', async () => {
    setLarkEnv();
    delete process.env.LARK_OPEN_IDS;
    delete process.env.LARK_ASSIGNEE_EMAILS;
    delete process.env.BOSSNOTE_URL;
    delete process.env.APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    const calls = mockFetch((url) => {
      if (url.includes('/auth/v3/tenant_access_token/internal')) {
        return jsonResponse({ code: 0, msg: 'ok', tenant_access_token: 't-abc', expire: 7200 });
      }
      if (url.includes('/contact/v3/users/batch_get_id')) {
        return jsonResponse({
          code: 0,
          data: { user_list: [{ email: 'prista.regina@dupoin.co.id', user_id: 'ou_prista_email' }] },
        });
      }
      if (url.includes('/im/v1/messages')) return jsonResponse({ code: 0, msg: 'ok' });
      return jsonResponse({ code: 1, msg: `unexpected ${url}` }, 404);
    });

    const ok = await notifyLarkTaskAsync({
      title: 'Check stock',
      creatorName: 'Ian',
      creatorId: 'boss-001',
      assigneeName: 'Prista',
      assigneeId: 'prista-001',
      assigneeEmail: 'prista@bossnote.id',
      priority: 'high',
      kind: 'reassign',
    });
    assert.equal(ok, true);
    const dm = calls.find((c) => c.url.includes('receive_id_type=open_id'));
    assert.ok(dm);
    const body = JSON.parse(String(dm.init?.body)) as { receive_id: string; content: string };
    assert.equal(body.receive_id, 'ou_prista_email');
    assert.match(JSON.parse(body.content).text, /^Task reassigned to you: Check stock/);
    const group = calls.find((c) => c.url.includes('receive_id_type=chat_id'));
    const groupBody = JSON.parse(String(group?.init?.body)) as { content: string };
    assert.match(JSON.parse(groupBody.content).text, /user_id="ou_prista_email"/);
  });

  it('uses LARK_OPEN_IDS by user id then name', async () => {
    clearLarkEnv();
    process.env.LARK_OPEN_IDS = 'boss-001:ou_by_id,Bayu:ou_by_name';
    assert.equal(
      await resolveAssigneeOpenId({ assigneeId: 'boss-001', assigneeName: 'Ian' }),
      'ou_by_id',
    );
    assert.equal(
      await resolveAssigneeOpenId({ assigneeId: 'other', assigneeName: 'Bayu' }),
      'ou_by_name',
    );
  });

  it('looks up a unique chat member by name when env has no mapping', async () => {
    setLarkEnv();
    delete process.env.LARK_OPEN_IDS;
    const calls = mockFetch((url) => {
      if (url.includes('/auth/v3/tenant_access_token/internal')) {
        return jsonResponse({ code: 0, msg: 'ok', tenant_access_token: 't-abc', expire: 7200 });
      }
      if (url.includes('/im/v1/chats/oc_test_chat/members')) {
        return jsonResponse({
          code: 0,
          msg: 'ok',
          data: {
            items: [
              { member_id: 'ou_ian_chat', name: 'Ian' },
              { member_id: 'ou_bayu_chat', name: 'Bayu' },
            ],
            has_more: false,
          },
        });
      }
      return jsonResponse({ code: 1, msg: `unexpected ${url}` }, 404);
    });
    assert.equal(await resolveAssigneeOpenId({ assigneeName: 'Ian' }), 'ou_ian_chat');
    assert.equal(await resolveAssigneeOpenId({ assigneeName: 'ian' }), 'ou_ian_chat');
    const membersCall = calls.find((c) => c.url.includes('/im/v1/chats/oc_test_chat/members'));
    assert.ok(membersCall);
    assert.match(membersCall.url, /member_id_type=open_id/);
    // Cached — second resolve does not refetch members.
    assert.equal(calls.filter((c) => c.url.includes('/members')).length, 1);
  });

  it('still posts a plain Assignee line when mention lookup fails', async () => {
    setLarkEnv();
    delete process.env.LARK_OPEN_IDS;
    delete process.env.BOSSNOTE_URL;
    delete process.env.APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    const calls = mockFetch((url) => {
      if (url.includes('/auth/v3/tenant_access_token/internal')) {
        return jsonResponse({ code: 0, msg: 'ok', tenant_access_token: 't-abc', expire: 7200 });
      }
      if (url.includes('/members')) {
        return jsonResponse({ code: 99991672, msg: 'no permission' }, 400);
      }
      if (url.includes('/im/v1/messages')) {
        return jsonResponse({ code: 0, msg: 'ok' });
      }
      return jsonResponse({ code: 1, msg: `unexpected ${url}` }, 404);
    });

    const ok = await notifyLarkTaskAsync({
      title: 'Review deck',
      creatorName: 'Bayu',
      assigneeName: 'Ian',
      assigneeId: 'boss-001',
      priority: 'high',
    });
    assert.equal(ok, true);
    const msgCall = calls.find((c) => c.url.includes('/im/v1/messages'));
    assert.ok(msgCall);
    const body = JSON.parse(String(msgCall?.init?.body)) as { content: string };
    assert.deepEqual(JSON.parse(body.content), {
      text: 'New task: Review deck\nFrom: Bayu\nAssignee: Ian\nPriority: high',
    });
  });

  it('matches Bayu to Lark display name Bayu Darmawan', async () => {
    assert.equal(
      matchOpenIdByPersonName('Bayu', new Map([['bayu darmawan', 'ou_bayu_full']])),
      'ou_bayu_full',
    );
    assert.equal(
      matchOpenIdByPersonName('Bayu Darmawan', new Map([['bayu', 'ou_bayu_short']])),
      'ou_bayu_short',
    );
    assert.equal(
      matchOpenIdByPersonName('Bayu', new Map([
        ['bayu darmawan', 'ou_one'],
        ['bayu santoso', 'ou_two'],
      ])),
      null,
    );

    setLarkEnv();
    delete process.env.LARK_OPEN_IDS;
    mockFetch((url) => {
      if (url.includes('/auth/v3/tenant_access_token/internal')) {
        return jsonResponse({ code: 0, msg: 'ok', tenant_access_token: 't-abc', expire: 7200 });
      }
      if (url.includes('/members')) {
        return jsonResponse({
          code: 0,
          msg: 'ok',
          data: {
            items: [{ member_id: 'ou_bayu_chat', name: 'Bayu Darmawan' }],
            has_more: false,
          },
        });
      }
      return jsonResponse({ code: 1, msg: 'unexpected' }, 404);
    });
    assert.equal(await resolveAssigneeOpenId({ assigneeName: 'Bayu' }), 'ou_bayu_chat');
    assert.equal(await resolveAssigneeOpenId({ assigneeName: 'Bayu Darmawan' }), 'ou_bayu_chat');
  });

  it('matches LARK_OPEN_IDS full name Bayu Darmawan to the short BossNote name', async () => {
    clearLarkEnv();
    process.env.LARK_OPEN_IDS = 'Bayu Darmawan:ou_bayu_env,boss-001:ou_ian';
    assert.equal(
      await resolveAssigneeOpenId({ assigneeId: 'bayu-001', assigneeName: 'Bayu' }),
      'ou_bayu_env',
    );
    assert.equal(
      await resolveAssigneeOpenId({ assigneeId: 'boss-001', assigneeName: 'Bayu' }),
      'ou_ian',
    );
  });

  it('posts an @mention when env mapping is present', async () => {
    setLarkEnv();
    process.env.LARK_OPEN_IDS = 'Ian:ou_ian_env';
    delete process.env.BOSSNOTE_URL;
    delete process.env.APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    const calls = mockFetch((url) => {
      if (url.includes('/auth/v3/tenant_access_token/internal')) {
        return jsonResponse({ code: 0, msg: 'ok', tenant_access_token: 't-abc', expire: 7200 });
      }
      if (url.includes('/im/v1/messages')) {
        return jsonResponse({ code: 0, msg: 'ok' });
      }
      return jsonResponse({ code: 1, msg: `unexpected ${url}` }, 404);
    });

    const ok = await notifyLarkTaskAsync({
      title: 'Review deck',
      creatorName: 'Bayu',
      assigneeName: 'Ian',
      priority: 'medium',
    });
    assert.equal(ok, true);
    const groupCall = calls.find((c) => c.url.includes('receive_id_type=chat_id'));
    const body = JSON.parse(String(groupCall?.init?.body)) as { content: string; receive_id: string };
    assert.equal(body.receive_id, 'oc_test_chat');
    assert.deepEqual(JSON.parse(body.content), {
      text: 'New task: Review deck\nFrom: Bayu\nAssignee: <at user_id="ou_ian_env">Ian</at>\nPriority: medium',
    });
    const dmCall = calls.find((c) => c.url.includes('receive_id_type=open_id'));
    assert.ok(dmCall);
    const dm = JSON.parse(String(dmCall?.init?.body)) as { receive_id: string; content: string };
    assert.equal(dm.receive_id, 'ou_ian_env');
    assert.deepEqual(JSON.parse(dm.content), {
      text: 'New task for you: Review deck\nFrom: Bayu\nPriority: medium',
    });
  });

  it('resolves Boss, Ian, and Bayu from LARK_OPEN_IDS without hardcoded ids', async () => {
    clearLarkEnv();
    process.env.LARK_OPEN_IDS = 'Boss:ou_boss,Ian:ou_ian,Bayu:ou_bayu';
    assert.equal(await resolveAssigneeOpenId({ assigneeName: 'Boss' }), 'ou_boss');
    assert.equal(await resolveAssigneeOpenId({ assigneeName: 'Ian', assigneeId: 'boss-001' }), 'ou_ian');
    assert.equal(await resolveAssigneeOpenId({ assigneeName: 'Bayu', assigneeId: 'bayu-001' }), 'ou_bayu');
  });

  it('skips the DM when the assignee open_id cannot be resolved', async () => {
    setLarkEnv();
    delete process.env.LARK_OPEN_IDS;
    delete process.env.BOSSNOTE_URL;
    const calls = mockFetch((url) => {
      if (url.includes('/auth/v3/tenant_access_token/internal')) {
        return jsonResponse({ code: 0, msg: 'ok', tenant_access_token: 't-abc', expire: 7200 });
      }
      if (url.includes('/members')) {
        return jsonResponse({ code: 99991672, msg: 'no permission' }, 400);
      }
      if (url.includes('/im/v1/messages')) {
        return jsonResponse({ code: 0, msg: 'ok' });
      }
      return jsonResponse({ code: 1, msg: `unexpected ${url}` }, 404);
    });
    const ok = await notifyLarkTaskAsync({
      title: 'Review deck',
      creatorName: 'Bayu',
      assigneeName: 'Ian',
      priority: 'high',
    });
    assert.equal(ok, true);
    assert.equal(calls.filter((c) => c.url.includes('receive_id_type=chat_id')).length, 1);
    assert.equal(calls.filter((c) => c.url.includes('receive_id_type=open_id')).length, 0);
  });

  it('keeps the group post when the assignee DM is rejected', async () => {
    setLarkEnv();
    process.env.LARK_OPEN_IDS = 'Ian:ou_ian_env';
    delete process.env.BOSSNOTE_URL;
    const errors: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    };
    const calls = mockFetch((url) => {
      if (url.includes('/auth/v3/tenant_access_token/internal')) {
        return jsonResponse({ code: 0, msg: 'ok', tenant_access_token: 't-abc', expire: 7200 });
      }
      if (url.includes('receive_id_type=open_id')) {
        return jsonResponse({ code: 230002, msg: 'bot cannot dm user' }, 400);
      }
      if (url.includes('receive_id_type=chat_id')) {
        return jsonResponse({ code: 0, msg: 'ok' });
      }
      return jsonResponse({ code: 1, msg: `unexpected ${url}` }, 404);
    });
    try {
      const ok = await notifyLarkTaskAsync({
        title: 'Review deck',
        creatorName: 'Bayu',
        creatorId: 'bayu-001',
        assigneeName: 'Ian',
        assigneeId: 'boss-001',
        priority: 'high',
      });
      assert.equal(ok, true);
      assert.equal(calls.filter((c) => c.url.includes('receive_id_type=chat_id')).length, 1);
      assert.equal(calls.filter((c) => c.url.includes('receive_id_type=open_id')).length, 1);
      assert.match(errors.join('\n'), /dm failed/);
    } finally {
      console.error = originalError;
    }
  });

  it('DMs only the assignee when they created the task for themselves', async () => {
    setLarkEnv();
    process.env.LARK_OPEN_IDS = 'Bayu:ou_bayu';
    delete process.env.BOSSNOTE_URL;
    const calls = mockFetch((url) => {
      if (url.includes('/auth/v3/tenant_access_token/internal')) {
        return jsonResponse({ code: 0, msg: 'ok', tenant_access_token: 't-abc', expire: 7200 });
      }
      if (url.includes('/im/v1/messages')) return jsonResponse({ code: 0, msg: 'ok' });
      return jsonResponse({ code: 1, msg: `unexpected ${url}` }, 404);
    });
    const ok = await notifyLarkTaskAsync({
      title: 'My reminder',
      creatorName: 'Bayu',
      creatorId: 'bayu-001',
      assigneeName: 'Bayu',
      assigneeId: 'bayu-001',
      priority: 'low',
    });
    assert.equal(ok, true);
    const dms = calls.filter((c) => c.url.includes('receive_id_type=open_id'));
    assert.equal(dms.length, 1);
    const dm = JSON.parse(String(dms[0]?.init?.body)) as { receive_id: string };
    assert.equal(dm.receive_id, 'ou_bayu');
    assert.equal(await sendUserText('not a valid id', 'hello'), false);
  });
});
