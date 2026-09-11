const DEFAULT_API_BASE = 'https://open.larksuite.com/open-apis';
const MEMBER_CACHE_MS = 5 * 60 * 1000;

export type LarkTaskNotifyInput = {
  title: string;
  /** Session user who created the task or performed the reassignment. */
  creatorName: string;
  creatorId?: string;
  assigneeName: string;
  assigneeId?: string;
  /** Stored Lark open_id / union_id / user_id when already known. */
  assigneeOpenId?: string | null;
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

type MemberCache = {
  key: string;
  byName: Map<string, string>;
  expiresAt: number;
};

let missingEnvLogged = false;
let membersLookupLogged = false;
let cachedToken: TokenCache | null = null;
let cachedMembers: MemberCache | null = null;

/** Test helper — clears token cache, member cache, and one-shot log flags. */
export function resetLarkStateForTests(): void {
  missingEnvLogged = false;
  membersLookupLogged = false;
  cachedToken = null;
  cachedMembers = null;
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

/**
 * Lark im/v1 text mention. Official syntax:
 * `<at user_id="ou_xxx">Name</at>` where user_id is open_id, union_id, or user_id.
 * `all` is rejected so we never @everyone by accident.
 */
export function normalizeLarkOpenId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  if (!id || id.toLowerCase() === 'all') return null;
  if (!/^[A-Za-z0-9_-]{4,128}$/.test(id)) return null;
  return id;
}

function sanitizeAtDisplayName(name: string): string {
  const cleaned = name.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  return cleaned || 'Unknown';
}

/** Build the official text-message @mention tag, or a plain name when id is missing. */
export function formatLarkMention(name: string, userId?: string | null): string {
  const display = sanitizeAtDisplayName((name || '').trim() || 'Unknown');
  const id = normalizeLarkOpenId(userId);
  if (!id) return display;
  return `<at user_id="${id}">${display}</at>`;
}

/**
 * Parse LARK_OPEN_IDS. Accepts JSON `{"Bayu":"ou_xxx"}` or
 * comma list `Bayu:ou_xxx,ian-001:ou_yyy` (keys are BossNote name or user id).
 */
export function parseLarkOpenIdMap(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  const text = (raw || '').trim();
  if (!text) return map;

  const entries: Array<[string, string]> = [];
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return map;
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === 'string') entries.push([key, value]);
      }
    } catch {
      return map;
    }
  } else {
    for (const part of text.split(',')) {
      const item = part.trim();
      if (!item) continue;
      const colon = item.indexOf(':');
      const equals = item.indexOf('=');
      let sep = -1;
      if (colon > 0 && (equals <= 0 || colon < equals)) sep = colon;
      else if (equals > 0) sep = equals;
      if (sep <= 0) continue;
      entries.push([item.slice(0, sep), item.slice(sep + 1)]);
    }
  }

  for (const [key, value] of entries) {
    const id = normalizeLarkOpenId(value);
    const label = key.trim().toLowerCase();
    if (!label || !id) continue;
    map.set(label, id);
  }
  return map;
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
    `Assignee: ${formatLarkMention(assignee, input.assigneeOpenId)}`,
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

type ChatMember = {
  member_id?: string;
  name?: string;
};

type ChatMembersResponse = {
  code?: number;
  msg?: string;
  data?: {
    items?: ChatMember[];
    page_token?: string;
    has_more?: boolean;
  };
};

async function fetchChatMemberOpenIds(config: LarkConfig, token: string): Promise<Map<string, string>> {
  const byName = new Map<string, string>();
  const ambiguous = new Set<string>();
  let pageToken = '';

  for (let page = 0; page < 10; page += 1) {
    const params = new URLSearchParams({
      member_id_type: 'open_id',
      page_size: '100',
    });
    if (pageToken) params.set('page_token', pageToken);
    const res = await fetch(`${config.apiBase}/im/v1/chats/${encodeURIComponent(config.chatId)}/members?${params}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
    });
    const data = (await res.json().catch(() => ({}))) as ChatMembersResponse;
    if (!res.ok || (typeof data.code === 'number' && data.code !== 0)) {
      if (!membersLookupLogged) {
        membersLookupLogged = true;
        console.warn('[lark] chat members lookup failed — mention falls back to plain name', data.code ?? res.status, data.msg ?? res.statusText);
      }
      return new Map();
    }

    for (const item of data.data?.items || []) {
      const id = normalizeLarkOpenId(item.member_id);
      const nameKey = (item.name || '').trim().toLowerCase();
      if (!id || !nameKey) continue;
      if (byName.has(nameKey) && byName.get(nameKey) !== id) {
        ambiguous.add(nameKey);
        continue;
      }
      byName.set(nameKey, id);
    }

    if (!data.data?.has_more || !data.data.page_token) break;
    pageToken = data.data.page_token;
  }

  for (const name of ambiguous) byName.delete(name);
  return byName;
}

async function chatMemberOpenIdByName(name: string): Promise<string | null> {
  const folded = name.trim().toLowerCase();
  if (!folded) return null;

  try {
    const config = readConfig();
    if (!config) return null;

    const key = `${config.chatId}:${config.apiBase}`;
    const now = Date.now();
    if (!cachedMembers || cachedMembers.key !== key || cachedMembers.expiresAt <= now) {
      const token = await getTenantToken();
      if (!token) return null;
      const byName = await fetchChatMemberOpenIds(config, token);
      cachedMembers = { key, byName, expiresAt: now + MEMBER_CACHE_MS };
    }
    return cachedMembers.byName.get(folded) || null;
  } catch (err) {
    if (!membersLookupLogged) {
      membersLookupLogged = true;
      console.warn('[lark] chat members lookup failed — mention falls back to plain name', err);
    }
    return null;
  }
}

/**
 * Resolve a Lark user id for @mention. Never throws.
 * Order: stored open_id → LARK_OPEN_IDS (id or name) → group member name match.
 */
export async function resolveAssigneeOpenId(input: {
  assigneeId?: string;
  assigneeName?: string;
  assigneeOpenId?: string | null;
}): Promise<string | null> {
  try {
    const stored = normalizeLarkOpenId(input.assigneeOpenId);
    if (stored) return stored;

    const envMap = parseLarkOpenIdMap(trimEnv('LARK_OPEN_IDS'));
    const assigneeId = (input.assigneeId || '').trim().toLowerCase();
    if (assigneeId && envMap.has(assigneeId)) return envMap.get(assigneeId) || null;
    const assigneeName = (input.assigneeName || '').trim();
    if (assigneeName && envMap.has(assigneeName.toLowerCase())) {
      return envMap.get(assigneeName.toLowerCase()) || null;
    }

    return await chatMemberOpenIdByName(assigneeName);
  } catch (err) {
    console.error('[lark] mention lookup failed', err);
    return null;
  }
}

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

/** Awaitable notify used by tests. Still never throws. */
export async function notifyLarkTaskAsync(input: LarkTaskNotifyInput): Promise<boolean> {
  try {
    const assigneeOpenId = await resolveAssigneeOpenId(input);
    return await sendGroupText(buildTaskNotifyText({ ...input, assigneeOpenId }));
  } catch (err) {
    console.error('[bossnote] lark notify failed:', err);
    return false;
  }
}

/** Fire-and-forget group notify. Safe to call after task create / reassign. */
export function notifyLarkTask(input: LarkTaskNotifyInput): void {
  void notifyLarkTaskAsync(input).catch((err) => {
    console.error('[bossnote] lark notify failed:', err);
  });
}
