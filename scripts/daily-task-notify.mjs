// Daily open-task digest via Web Push.
// Mirrors cleanup-old-tasks.mjs: run from the app directory with env loaded.
//
// Crontab (Asia/Jakarta, 10:00):
//   0 10 * * * TZ=Asia/Jakarta cd /home/ubuntu/apps/bossnote && set -a && . ./.env && set +a && /usr/bin/node scripts/daily-task-notify.mjs >> /home/ubuntu/logs/bossnote-notify.log 2>&1
import { Pool } from 'pg';
import webpush from 'web-push';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@gorillaworkout.id';

if (!DATABASE_URL) {
  console.error('[notify] DATABASE_URL is required');
  process.exit(1);
}
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('[notify] VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required');
  process.exit(1);
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const pool = new Pool({ connectionString: DATABASE_URL });
const OPEN = ['todo', 'in_progress', 'waiting'];

function buildDigest(tasks) {
  if (!tasks.length) return null;
  const titles = tasks
    .map((t) => (t.title || t.title_id || '').trim())
    .filter(Boolean);
  const top = titles.slice(0, 3);
  const extra = titles.length > 3 ? ` (+${titles.length - 3} more)` : '';
  const count = tasks.length;
  return {
    title: count === 1 ? '1 open task' : `${count} open tasks`,
    body: top.length
      ? `You have ${count} ${count === 1 ? 'task' : 'tasks'}: ${top.join(' · ')}${extra}`
      : `You have ${count} open ${count === 1 ? 'task' : 'tasks'}.`,
    url: '/dashboard',
  };
}

async function sendToUser(client, userId, payload) {
  const { rows: subs } = await client.query(
    'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
    [userId],
  );
  let sent = 0;
  let removed = 0;
  const body = JSON.stringify(payload);
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
      );
      sent += 1;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await client.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
        removed += 1;
        console.log('[notify] removed dead subscription', sub.endpoint.slice(0, 48));
      } else {
        console.error('[notify] send failed', err.statusCode || err.message);
      }
    }
  }
  return { sent, removed };
}

async function main() {
  const client = await pool.connect();
  try {
    const { rows: tasks } = await client.query(
      `SELECT assignee_id, title, title_id FROM tasks
       WHERE status = ANY($1::text[])
       ORDER BY created_at DESC`,
      [OPEN],
    );

    const groups = new Map();
    for (const task of tasks) {
      if (!task.assignee_id) continue;
      const list = groups.get(task.assignee_id) || [];
      list.push(task);
      groups.set(task.assignee_id, list);
    }

    let users = 0;
    let sent = 0;
    let skipped = 0;
    let removed = 0;

    for (const [userId, list] of groups) {
      const payload = buildDigest(list);
      if (!payload) {
        skipped += 1;
        continue;
      }
      users += 1;
      const result = await sendToUser(client, userId, payload);
      sent += result.sent;
      removed += result.removed;
      if (result.sent === 0) skipped += 1;
    }

    console.log(
      `[notify] users=${users} sent=${sent} skipped=${skipped} removed=${removed} open_tasks=${tasks.length}`,
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('[notify] failed:', e);
  process.exit(1);
});
