import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTaskNotifyText,
  formatLarkMention,
  getTenantToken,
  isLarkConfigured,
  normalizeLarkOpenId,
  notifyLarkTaskAsync,
  parseLarkOpenIdMap,
  resetLarkStateForTests,
  resolveAssigneeOpenId,
  sendGroupText,
} from './lark.ts';

const originalFetch = globalThis.fetch;
const savedEnv = {
  LARK_APP_ID: process.env.LARK_APP_ID,
  LARK_APP_SECRET: process.env.LARK_APP_SECRET,
  LARK_CHAT_ID: process.env.LARK_CHAT_ID,
  LARK_API_BASE: process.env.LARK_API_BASE,
  LARK_OPEN_IDS: process.env.LARK_OPEN_IDS,
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
    assert.match(calls[1].url, /im\/v1\/chats\/oc_test_chat\/members/);
    assert.match(calls[1].url, /member_id_type=open_id/);
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
    const msgCall = calls.find((c) => c.url.includes('/im/v1/messages'));
    const body = JSON.parse(String(msgCall?.init?.body)) as { content: string };
    assert.deepEqual(JSON.parse(body.content), {
      text: 'New task: Review deck\nFrom: Bayu\nAssignee: <at user_id="ou_ian_env">Ian</at>\nPriority: medium',
    });
  });
});
