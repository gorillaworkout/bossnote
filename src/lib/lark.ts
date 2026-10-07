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
  /** Login email, or any other address already known for this assignee. */
  assigneeEmail?: string | null;
  priority?: string | null;
  /** Task id so the group message can link to the screenshot. */
  taskId?: string;
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
let cachedEmailOpenIds = new Map<string, { openId: string; expiresAt: number }>();

/** Test helper — clears token cache, member cache, and one-shot log flags. */
export function resetLarkStateForTests(): void {
  missingEnvLogged = false;
  membersLookupLogged = false;
  cachedToken = null;
  cachedMembers = null;
  cachedEmailOpenIds = new Map();
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

/** Fold a person name for mention lookup (case, accents, punctuation). */
export function foldPersonName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Match a BossNote name to a Lark display name.
 * Exact match wins. Otherwise a unique first-name or prefix match
 * ("Bayu" ↔ "Bayu Darmawan"). Two candidates → null (never guess).
 */
export function matchOpenIdByPersonName(personName: string, byName: Map<string, string>): string | null {
  const folded = foldPersonName(personName);
  if (!folded) return null;

  const exact = byName.get(folded);
  if (exact) return exact;

  const queryTokens = folded.split(' ').filter((token) => token.length >= 3);
  if (queryTokens.length === 0) return null;
  const queryFirst = queryTokens[0];

  const hits = new Set<string>();
  for (const [name, id] of byName) {
    if (!id) continue;
    const nameTokens = name.split(' ').filter((token) => token.length >= 3);
    if (nameTokens.length === 0) continue;
    const sameFirst = nameTokens[0] === queryFirst;
    const prefix = name.startsWith(`${folded} `) || folded.startsWith(`${name} `);
    if (sameFirst || prefix) hits.add(id);
  }
  if (hits.size === 1) return [...hits][0];
  return null;
}

/** BossNote ids (bayu-001) are not display names. */
function isIdLikeKey(key: string): boolean {
  return /[-_]/.test(key) && !/\s/.test(key);
}

function foldedNameIndex(source: Map<string, string>): Map<string, string> {
  const out = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const [key, id] of source) {
    if (!id || isIdLikeKey(key)) continue;
    const folded = foldPersonName(key);
    if (!folded) continue;
    const prev = out.get(folded);
    if (prev && prev !== id) ambiguous.add(folded);
    else out.set(folded, id);
  }
  for (const name of ambiguous) out.delete(name);
  return out;
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

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) return null;
  return email;
}

/** Lark mailbox stored on `users.lark_email`. Same shape as directory-email lookup. */
export function normalizeLarkDirectoryEmail(value: unknown): string | null {
  return normalizeEmail(value);
}

/**
 * Parse an assignee → directory-email map. Same shapes as LARK_OPEN_IDS:
 * JSON `{"boss-001":"ian@dupoin.com"}` or `boss-001:ian@dupoin.com,Bayu=bayu@dupoin.co.id`.
 * Keys are BossNote user ids or display names. Values that are not emails are dropped.
 */
export function parseLarkEmailMap(raw: string): Map<string, string> {
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
    const email = normalizeEmail(value);
    const label = key.trim().toLowerCase();
    if (!label || !email) continue;
    map.set(label, email);
  }
  return map;
}

/**
 * Dupoin addresses that exist in Lark. BossNote login emails are @bossnote.id
 * and are not in the Lark directory. Ian's user id is boss-001 (there is no ian-001).
 * Bayu's Dupoin email is not in this repo.
 */
const DEFAULT_LARK_ASSIGNEE_EMAILS = [
  'boss-001:ian@dupoin.com',
  'Ian:ian@dupoin.com',
  'Boss:ian@dupoin.com',
  'sandra-001:alessandra.jovita@dupoin.co.id',
  'Sandra:alessandra.jovita@dupoin.co.id',
  'Alessandra:alessandra.jovita@dupoin.co.id',
  'prista-001:prista.regina@dupoin.co.id',
  'Prista:prista.regina@dupoin.co.id',
].join(',');

function emailFromMap(map: Map<string, string>, assigneeId: string, assigneeName: string): string | null {
  if (assigneeId && map.has(assigneeId)) return map.get(assigneeId) || null;
  const folded = foldPersonName(assigneeName);
  if (!folded) return null;
  for (const [key, email] of map) {
    if (isIdLikeKey(key)) continue;
    if (foldPersonName(key) === folded) return email;
  }
  return null;
}

/**
 * Directory email to send to Lark contact batch_get_id.
 * LARK_ASSIGNEE_EMAILS overrides one key at a time. Built-in Dupoin addresses
 * win over the BossNote login email. A passed email is used only when neither map hits.
 */
export function resolveAssigneeLarkEmail(input: {
  assigneeId?: string;
  assigneeName?: string;
  assigneeEmail?: string | null;
}): string | null {
  const assigneeId = (input.assigneeId || '').trim().toLowerCase();
  const assigneeName = (input.assigneeName || '').trim();
  const fromEnv = emailFromMap(parseLarkEmailMap(trimEnv('LARK_ASSIGNEE_EMAILS')), assigneeId, assigneeName);
  if (fromEnv) return fromEnv;
  const fromDefault = emailFromMap(parseLarkEmailMap(DEFAULT_LARK_ASSIGNEE_EMAILS), assigneeId, assigneeName);
  if (fromDefault) return fromDefault;
  return normalizeEmail(input.assigneeEmail);
}

type BatchGetIdUser = {
  user_id?: string;
  email?: string;
};

type BatchGetIdResponse = {
  code?: number;
  msg?: string;
  data?: {
    user_list?: BatchGetIdUser[];
  };
};

function openIdFromEmailUserList(email: string, list: BatchGetIdUser[] | undefined): string | null {
  if (!list || list.length === 0) return null;
  const wanted = email.toLowerCase();
  const matched = list.filter((item) => (item.email || '').trim().toLowerCase() === wanted);
  const candidates = matched.length > 0 ? matched : list.length === 1 ? list : [];
  for (const item of candidates) {
    const id = normalizeLarkOpenId(item.user_id);
    if (id) return id;
  }
  return null;
}

/**
 * POST /contact/v3/users/batch_get_id?user_id_type=open_id
 * Resolves one directory email to a Lark open_id. Never throws.
 */
export async function lookupLarkOpenIdByEmail(email: string): Promise<string | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  try {
    const now = Date.now();
    const cached = cachedEmailOpenIds.get(normalized);
    if (cached && cached.expiresAt > now) return cached.openId;

    const config = readConfig();
    if (!config) return null;
    const token = await getTenantToken();
    if (!token) return null;

    const res = await fetch(`${config.apiBase}/contact/v3/users/batch_get_id?user_id_type=open_id`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ emails: [normalized], include_resigned: false }),
    });
    const data = (await res.json().catch(() => ({}))) as BatchGetIdResponse;
    if (!res.ok || (typeof data.code === 'number' && data.code !== 0)) {
      console.error(
        '[lark] email open_id lookup failed',
        normalized,
        data.code ?? res.status,
        data.msg ?? res.statusText,
      );
      return null;
    }

    const openId = openIdFromEmailUserList(normalized, data.data?.user_list);
    if (!openId) {
      console.warn('[lark] no Lark open_id for email', normalized);
      return null;
    }
    cachedEmailOpenIds.set(normalized, { openId, expiresAt: now + MEMBER_CACHE_MS });
    return openId;
  } catch (err) {
    console.error('[lark] email open_id lookup failed', normalized, err);
    return null;
  }
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
  const url = publicBossnoteUrl().replace(/\/+$/, '');
  if (url) {
    const taskId = (input.taskId || '').trim();
    lines.push(taskId ? `${url}/dashboard?task=${encodeURIComponent(taskId)}` : url);
  }
  return lines.join('\n');
}

/** Personal reminder. No @mention — the message is already a DM to the assignee. */
export function buildAssigneeDmText(input: LarkTaskNotifyInput): string {
  const title = (input.title || '').trim() || 'Untitled task';
  const from = (input.creatorName || '').trim() || 'Unknown';
  const priority = (input.priority || 'medium').trim() || 'medium';
  const heading = input.kind === 'reassign' ? 'Task reassigned to you' : 'New task for you';
  const lines = [
    `${heading}: ${title}`,
    `From: ${from}`,
    `Priority: ${priority}`,
  ];
  const url = publicBossnoteUrl().replace(/\/+$/, '');
  if (url) {
    const taskId = (input.taskId || '').trim();
    lines.push(taskId ? `${url}/dashboard?task=${encodeURIComponent(taskId)}` : url);
  }
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
      const nameKey = foldPersonName(item.name || '');
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
  const folded = foldPersonName(name);
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
    return matchOpenIdByPersonName(folded, cachedMembers.byName);
  } catch (err) {
    if (!membersLookupLogged) {
      membersLookupLogged = true;
      console.warn('[lark] chat members lookup failed — mention falls back to plain name', err);
    }
    return null;
  }
}

/**
 * Resolve a Lark user id for @mention and the assignee DM. Never throws.
 * Order: stored open_id → LARK_OPEN_IDS (id or name) → directory email
 * (contact/v3/users/batch_get_id) → group member name match.
 */
export async function resolveAssigneeOpenId(input: {
  assigneeId?: string;
  assigneeName?: string;
  assigneeOpenId?: string | null;
  assigneeEmail?: string | null;
}): Promise<string | null> {
  try {
    const stored = normalizeLarkOpenId(input.assigneeOpenId);
    if (stored) return stored;

    const envMap = parseLarkOpenIdMap(trimEnv('LARK_OPEN_IDS'));
    const assigneeId = (input.assigneeId || '').trim().toLowerCase();
    if (assigneeId && envMap.has(assigneeId)) return envMap.get(assigneeId) || null;
    const assigneeName = (input.assigneeName || '').trim();
    const fromEnv = matchOpenIdByPersonName(assigneeName, foldedNameIndex(envMap));
    if (fromEnv) return fromEnv;

    const email = resolveAssigneeLarkEmail({
      assigneeId,
      assigneeName,
      assigneeEmail: input.assigneeEmail,
    });
    if (email) {
      const fromEmail = await lookupLarkOpenIdByEmail(email);
      if (fromEmail) return fromEmail;
    }

    return await chatMemberOpenIdByName(assigneeName);
  } catch (err) {
    console.error('[lark] mention lookup failed', err);
    return null;
  }
}

/**
 * POST /im/v1/messages. Group uses receive_id_type=chat_id; a personal
 * reminder uses receive_id_type=open_id. Never throws.
 */
async function sendImText(
  receiveIdType: 'chat_id' | 'open_id',
  receiveId: string,
  text: string,
  failLabel: string,
): Promise<boolean> {
  try {
    const config = readConfig();
    if (!config) return false;

    const trimmed = (text || '').trim();
    const id = receiveId.trim();
    if (!trimmed || !id) return false;

    const token = await getTenantToken();
    if (!token) return false;

    const res = await fetch(`${config.apiBase}/im/v1/messages?receive_id_type=${receiveIdType}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        receive_id: id,
        msg_type: 'text',
        content: JSON.stringify({ text: trimmed }),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as MessageResponse;
    if (!res.ok || (typeof data.code === 'number' && data.code !== 0)) {
      console.error(`[lark] ${failLabel}`, data.code ?? res.status, data.msg ?? res.statusText);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[lark] ${failLabel}`, err);
    return false;
  }
}

/**
 * POST /im/v1/messages?receive_id_type=chat_id
 * No-ops (log once) when Lark env is missing. Never throws.
 */
export async function sendGroupText(text: string): Promise<boolean> {
  const config = readConfig();
  if (!config) return false;
  return sendImText('chat_id', config.chatId, text, 'send failed');
}

/** Personal IM to a Lark open_id. No-ops when the id is missing or invalid. */
export async function sendUserText(openId: string, text: string): Promise<boolean> {
  const id = normalizeLarkOpenId(openId);
  if (!id) return false;
  return sendImText('open_id', id, text, 'dm failed');
}

/** Awaitable notify used by tests. Still never throws. Group result is the return value; a failed DM is logged and ignored. */
export async function notifyLarkTaskAsync(input: LarkTaskNotifyInput): Promise<boolean> {
  try {
    const assigneeOpenId = await resolveAssigneeOpenId(input);
    const groupOk = await sendGroupText(buildTaskNotifyText({ ...input, assigneeOpenId }));
    if (assigneeOpenId) {
      await sendUserText(assigneeOpenId, buildAssigneeDmText(input));
    }
    return groupOk;
  } catch (err) {
    console.error('[bossnote] lark notify failed:', err);
    return false;
  }
}

/** Fire-and-forget group post plus assignee DM. Safe to call after task create / reassign. */
export function notifyLarkTask(input: LarkTaskNotifyInput): void {
  void notifyLarkTaskAsync(input).catch((err) => {
    console.error('[bossnote] lark notify failed:', err);
  });
}
