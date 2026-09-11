import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTaskNotifyText,
  getTenantToken,
  isLarkConfigured,
  resetLarkStateForTests,
  sendGroupText,
} from './lark.ts';

const originalFetch = globalThis.fetch;
const savedEnv = {
  LARK_APP_ID: process.env.LARK_APP_ID,
  LARK_APP_SECRET: process.env.LARK_APP_SECRET,
  LARK_CHAT_ID: process.env.LARK_CHAT_ID,
  LARK_API_BASE: process.env.LARK_API_BASE,
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
      assigneeName: 'Ian',
      priority: 'high',
    });
    assert.equal(
      text,
      'New task: Review deck\nAssignee: Ian\nPriority: high\nhttps://bossnote.example',
    );
  });

  it('uses reassign heading and medium when priority is missing', () => {
    delete process.env.BOSSNOTE_URL;
    delete process.env.APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    const text = buildTaskNotifyText({
      title: 'Follow up vendor',
      assigneeName: 'Bayu',
      kind: 'reassign',
    });
    assert.equal(text, 'Task reassigned: Follow up vendor\nAssignee: Bayu\nPriority: medium');
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
