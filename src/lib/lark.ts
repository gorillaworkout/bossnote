const DEFAULT_API_BASE = 'https://open.larksuite.com/open-apis';

export type LarkTaskNotifyInput = {
  title: string;
  /** Session user who created the task or performed the reassignment. */
  creatorName: string;
  creatorId?: string;
  assigneeName: string;
  priority?: string | null;
  /** Defaults to "New task". Use "reassign" after an assignee change. */
  kind?: 'new' | 'reassign';
};

type LarkConfig = {
  appId: string;
  appSecret: string;
  chatId: string;
  apiBase: string;
};

type TokenCache = {
  key: string;
  token: string;
  expiresAt: number;
};

let missingEnvLogged = false;
let cachedToken: TokenCache | null = null;

/** Test helper — clears token cache and the missing-env log flag. */
export function resetLarkStateForTests(): void {
  missingEnvLogged = false;
  cachedToken = null;
}

function trimEnv(name: string): string {
  return (process.env[name] || '').trim();
}

function apiBase(): string {
  return (trimEnv('LARK_API_BASE') || DEFAULT_API_BASE).replace(/\/+$/, '');
}

function readConfig(): LarkConfig | null {
  const appId = trimEnv('LARK_APP_ID');
  const appSecret = trimEnv('LARK_APP_SECRET');
  const chatId = trimEnv('LARK_CHAT_ID');
  if (!appId || !appSecret || !chatId) {
    if (!missingEnvLogged) {
      missingEnvLogged = true;
      console.warn('[lark] LARK_APP_ID / LARK_APP_SECRET / LARK_CHAT_ID missing — skip send');
    }
    return null;
  }
  return { appId, appSecret, chatId, apiBase: apiBase() };
}

export function isLarkConfigured(): boolean {
  return Boolean(trimEnv('LARK_APP_ID') && trimEnv('LARK_APP_SECRET') && trimEnv('LARK_CHAT_ID'));
}

export function publicBossnoteUrl(): string {
  return trimEnv('BOSSNOTE_URL') || trimEnv('APP_URL') || trimEnv('NEXT_PUBLIC_APP_URL');
}

export function buildTaskNotifyText(input: LarkTaskNotifyInput): string {
  const title = (input.title || '').trim() || 'Untitled task';
  const from = (input.creatorName || '').trim() || 'Unknown';
  const assignee = (input.assigneeName || '').trim() || 'Unknown';
  const priority = (input.priority || 'medium').trim() || 'medium';
  const heading = input.kind === 'reassign' ? 'Task reassigned' : 'New task';
  const lines = [
    `${heading}: ${title}`,
    `From: ${from}`,
    `Assignee: ${assignee}`,
    `Priority: ${priority}`,
  ];
  const url = publicBossnoteUrl();
  if (url) lines.push(url);
  return lines.join('\n');
}

type TokenResponse = {
  code?: number;
  msg?: string;
  tenant_access_token?: string;
  expire?: number;
};

/**
 * POST /auth/v3/tenant_access_token/internal.
 * Returns null (and logs) when env is missing or the token call fails. Never throws.
 */
export async function getTenantToken(): Promise<string | null> {
  try {
    const config = readConfig();
    if (!config) return null;

    const key = `${config.appId}:${config.apiBase}`;
    const now = Date.now();
    if (cachedToken && cachedToken.key === key && cachedToken.expiresAt > now + 60_000) {
      return cachedToken.token;
    }

    const res = await fetch(`${config.apiBase}/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ app_id: config.appId, app_secret: config.appSecret }),
    });
    const data = (await res.json().catch(() => ({}))) as TokenResponse;
    if (!res.ok || data.code !== 0 || !data.tenant_access_token) {
      console.error('[lark] token failed', data.code ?? res.status, data.msg ?? res.statusText);
      cachedToken = null;
      return null;
    }

    const expireSec = typeof data.expire === 'number' && data.expire > 0 ? data.expire : 7200;
    cachedToken = {
      key,
      token: data.tenant_access_token,
      expiresAt: now + expireSec * 1000,
    };
    return cachedToken.token;
  } catch (err) {
    console.error('[lark] token failed', err);
    cachedToken = null;
    return null;
  }
}

type MessageResponse = {
  code?: number;
  msg?: string;
};

/**
 * POST /im/v1/messages?receive_id_type=chat_id
 * No-ops (log once) when Lark env is missing. Never throws.
 */
export async function sendGroupText(text: string): Promise<boolean> {
  try {
    const config = readConfig();
    if (!config) return false;

    const trimmed = (text || '').trim();
    if (!trimmed) return false;

    const token = await getTenantToken();
    if (!token) return false;

    const res = await fetch(`${config.apiBase}/im/v1/messages?receive_id_type=chat_id`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        receive_id: config.chatId,
        msg_type: 'text',
        content: JSON.stringify({ text: trimmed }),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as MessageResponse;
    if (!res.ok || (typeof data.code === 'number' && data.code !== 0)) {
      console.error('[lark] send failed', data.code ?? res.status, data.msg ?? res.statusText);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[lark] send failed', err);
    return false;
  }
}

/** Fire-and-forget group notify. Safe to call after task create / reassign. */
export function notifyLarkTask(input: LarkTaskNotifyInput): void {
  void sendGroupText(buildTaskNotifyText(input)).catch((err) => {
    console.error('[bossnote] lark notify failed:', err);
  });
}
