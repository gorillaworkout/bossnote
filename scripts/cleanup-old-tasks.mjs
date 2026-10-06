// 6-month retention cleanup: delete `done` tasks older than 6 months
// and remove their voice files (task + replies) plus every screenshot
// from disk so storage doesn't fill up. Replies cascade-delete with the task.
//
// Run from the app directory with DATABASE_URL, VOICE_UPLOAD_DIR, and
// IMAGE_UPLOAD_DIR set, e.g. from cron:
//   cd /home/ubuntu/apps/bossnote && set -a && . ./.env && set +a \
//     && node scripts/cleanup-old-tasks.mjs
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DATABASE_URL = process.env.DATABASE_URL;
const VOICE_DIR = process.env.VOICE_UPLOAD_DIR || '/home/ubuntu/data/bossnote-voices';
const IMAGE_DIR = process.env.IMAGE_UPLOAD_DIR || '/home/ubuntu/data/bossnote-images';
const IMAGE_NAME_EXT = '(?:jpe?g|png|webp|gif|heic|heif)';
export const RETENTION_MONTHS = 6;
const MAX_IMAGE_INDEX = 31;

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Same rule as `isTaskImageFilename` in src/lib/task-image.ts. */
export function isOwnedTaskImage(taskId, filename) {
  if (!/^[a-f0-9-]{36}$/i.test(taskId || '')) return false;
  const name = String(filename || '');
  const escaped = escapeRegExp(taskId);
  if (new RegExp(`^${escaped}\\.${IMAGE_NAME_EXT}$`, 'i').test(name)) return true;
  const match = name.match(new RegExp(`^${escaped}-(\\d{1,2})\\.${IMAGE_NAME_EXT}$`, 'i'));
  if (!match) return false;
  const index = Number(match[1]);
  return Number.isInteger(index) && index >= 0 && index <= MAX_IMAGE_INDEX;
}

export function doneTaskPurgeSql() {
  return `SELECT id, voice_path FROM tasks
       WHERE status = 'done' AND updated_at < NOW() - INTERVAL '${RETENTION_MONTHS} months'`;
}

// voice_path is stored as `/api/voice/<uuid>.<ext>`; the file on disk is
// `<uuid>.<ext>` under VOICE_DIR. Validate strictly to avoid traversal.
function voiceFilename(voicePath) {
  if (!voicePath) return null;
  const f = String(voicePath).split('/').pop();
  return /^[a-f0-9-]{36}\.[a-z0-9]{2,4}$/i.test(f) ? f : null;
}

function deleteFile(filename) {
  if (!filename) return;
  const p = path.join(VOICE_DIR, filename);
  try {
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      console.log('[cleanup] removed file', filename);
    }
  } catch (e) {
    console.error('[cleanup] failed to remove', filename, e.message);
  }
}

/** Deletes legacy `{id}.ext` and gallery `{id}-{n}.ext` files. Returns removed names. */
export function deleteTaskImageFiles(imageDir, taskId) {
  if (!/^[a-f0-9-]{36}$/i.test(taskId || '')) return [];
  let names = [];
  try {
    names = fs.readdirSync(imageDir);
  } catch {
    return [];
  }
  const removed = [];
  for (const name of names) {
    if (!isOwnedTaskImage(taskId, name)) continue;
    const filePath = path.join(imageDir, name);
    try {
      fs.unlinkSync(filePath);
      removed.push(name);
      console.log('[cleanup] removed image', name);
    } catch (e) {
      console.error('[cleanup] failed to remove image', name, e.message);
    }
  }
  return removed;
}

export async function purgeDoneTasks(pool) {
  const client = await pool.connect();
  try {
    const { rows: doneTasks } = await client.query(doneTaskPurgeSql());

    const taskIds = doneTasks.map((r) => r.id);
    const replyFiles = [];
    if (taskIds.length > 0) {
      const { rows: replies } = await client.query(
        `SELECT voice_path FROM task_replies WHERE task_id = ANY($1::text[])`,
        [taskIds],
      );
      for (const r of replies) replyFiles.push(r.voice_path);
    }

    for (const t of doneTasks) {
      deleteFile(voiceFilename(t.voice_path));
      deleteTaskImageFiles(IMAGE_DIR, t.id);
    }
    for (const vp of replyFiles) deleteFile(voiceFilename(vp));

    let deleted = 0;
    if (taskIds.length > 0) {
      const res = await client.query(
        `DELETE FROM tasks WHERE id = ANY($1::text[])`,
        [taskIds],
      );
      deleted = res.rowCount;
    }

    console.log(
      `[cleanup] deleted ${deleted} done task(s) older than ${RETENTION_MONTHS} months.`,
    );
    return deleted;
  } finally {
    client.release();
  }
}

async function main() {
  if (!DATABASE_URL) {
    console.error('[cleanup] DATABASE_URL is required');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    await purgeDoneTasks(pool);
  } finally {
    await pool.end();
  }
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((e) => {
    console.error('[cleanup] failed:', e);
    process.exit(1);
  });
}
