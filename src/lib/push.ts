import webpush from 'web-push';
import { v4 as uuidv4 } from 'uuid';
import { execute, queryAll, queryOne } from '@/lib/database';
import { buildDigestPayload, groupOpenTasksByAssignee, OPEN_TASK_STATUSES } from '@/lib/push-digest';

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

export type PushSubscriptionInput = {
  endpoint: string;
  keys?: { p256dh?: string; auth?: string };
};

type StoredSub = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

let vapidReady = false;

function vapidConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function ensureVapid(): boolean {
  if (vapidReady) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@gorillaworkout.id';
  if (!publicKey || !privateKey) {
    console.warn('[push] VAPID keys missing — skip send');
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidReady = true;
  return true;
}

export function getVapidPublicKey(): string {
  return process.env.VAPID_PUBLIC_KEY || '';
}

function subscriptionParts(sub: PushSubscriptionInput): { endpoint: string; p256dh: string; auth: string } | null {
  const endpoint = typeof sub.endpoint === 'string' ? sub.endpoint.trim() : '';
  const p256dh = typeof sub.keys?.p256dh === 'string' ? sub.keys.p256dh.trim() : '';
  const auth = typeof sub.keys?.auth === 'string' ? sub.keys.auth.trim() : '';
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, p256dh, auth };
}

export async function saveSubscription(
  userId: string,
  sub: PushSubscriptionInput,
  userAgent?: string | null,
): Promise<boolean> {
  const parts = subscriptionParts(sub);
  if (!parts) return false;

  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM push_subscriptions WHERE endpoint = ?',
    [parts.endpoint],
  );

  if (existing) {
    await execute(
      `UPDATE push_subscriptions
       SET user_id = ?, p256dh = ?, auth = ?, user_agent = ?
       WHERE endpoint = ?`,
      [userId, parts.p256dh, parts.auth, userAgent || null, parts.endpoint],
    );
    return true;
  }

  await execute(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [uuidv4(), userId, parts.endpoint, parts.p256dh, parts.auth, userAgent || null],
  );
  return true;
}

export async function removeSubscription(endpoint: string): Promise<void> {
  if (!endpoint) return;
  await execute('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
}

function isGoneStatus(err: unknown): boolean {
  const status = (err as { statusCode?: number })?.statusCode;
  return status === 404 || status === 410;
}

export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; removed: number }> {
  if (!ensureVapid()) return { sent: 0, removed: 0 };

  const subs = await queryAll<StoredSub>(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?',
    [userId],
  );
  if (subs.length === 0) return { sent: 0, removed: 0 };

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || '/dashboard',
  });

  let sent = 0;
  let removed = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
        sent += 1;
      } catch (err) {
        if (isGoneStatus(err)) {
          await removeSubscription(sub.endpoint);
          removed += 1;
        } else {
          console.error('[push] send failed', sub.endpoint.slice(0, 48), err);
        }
      }
    }),
  );

  return { sent, removed };
}

export async function sendDailyTaskDigests(): Promise<{
  users: number;
  sent: number;
  skipped: number;
  removed: number;
}> {
  const placeholders = OPEN_TASK_STATUSES.map(() => '?').join(', ');
  const tasks = await queryAll<{ assignee_id: string; title: string; title_id: string | null }>(
    `SELECT assignee_id, title, title_id FROM tasks
     WHERE status IN (${placeholders})
     ORDER BY created_at DESC`,
    [...OPEN_TASK_STATUSES],
  );

  const groups = groupOpenTasksByAssignee(tasks);
  let sent = 0;
  let skipped = 0;
  let removed = 0;
  let users = 0;

  for (const [userId, list] of groups) {
    const payload = buildDigestPayload(list);
    if (!payload) {
      skipped += 1;
      continue;
    }
    users += 1;
    const result = await sendPushToUser(userId, payload);
    sent += result.sent;
    removed += result.removed;
    if (result.sent === 0) skipped += 1;
  }

  return { users, sent, skipped, removed };
}
