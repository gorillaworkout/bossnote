// 6-month retention cleanup: delete `done` tasks older than 6 months
// and remove their voice files (task + replies) from disk so storage
// doesn't fill up. Replies are cascade-deleted with their parent task.
//
// Run from the app directory with DATABASE_URL + VOICE_UPLOAD_DIR set,
// e.g. from cron:
//   cd /home/ubuntu/apps/bossnote && set -a && . ./.env && set +a \
//     && node scripts/cleanup-old-tasks.mjs
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

const DATABASE_URL = process.env.DATABASE_URL;
const VOICE_DIR = process.env.VOICE_UPLOAD_DIR || '/home/ubuntu/data/bossnote-voices';
const RETENTION_MONTHS = 6;

if (!DATABASE_URL) {
  console.error('[cleanup] DATABASE_URL is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

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

async function main() {
  const client = await pool.connect();
  try {
    const { rows: doneTasks } = await client.query(
      `SELECT id, voice_path FROM tasks
       WHERE status = 'done' AND updated_at < NOW() - INTERVAL '6 months'`,
    );

    const taskIds = doneTasks.map((r) => r.id);
    const replyFiles = [];
    if (taskIds.length > 0) {
      const { rows: replies } = await client.query(
        `SELECT voice_path FROM task_replies WHERE task_id = ANY($1::text[])`,
        [taskIds],
      );
      for (const r of replies) replyFiles.push(r.voice_path);
    }

    for (const t of doneTasks) deleteFile(voiceFilename(t.voice_path));
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
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('[cleanup] failed:', e);
  process.exit(1);
});
