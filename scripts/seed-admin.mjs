import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { ADMIN_USER_ID } from '../src/lib/roles.ts';
import {
  ADMIN_SETTINGS_MODEL,
  adminPasswordError,
  deriveLoginEmail,
  normalizeAdminName,
} from '../src/lib/admin-seed.ts';

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

const passwordError = adminPasswordError(process.env.ADMIN_PASSWORD);
if (passwordError) {
  console.error(`[seed-admin] ${passwordError}`);
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[seed-admin] DATABASE_URL is required');
  process.exit(1);
}

const name = normalizeAdminName(process.env.ADMIN_NAME);
const pool = new pg.Pool({ connectionString: databaseUrl });
const client = await pool.connect();
try {
  const collision = await client.query(
    'SELECT id FROM users WHERE LOWER(name) = LOWER($1) AND id <> $2',
    [name, ADMIN_USER_ID],
  );
  if (collision.rows[0]) {
    console.error('[seed-admin] ADMIN_NAME is already used by another user');
    process.exit(1);
  }

  const emailOwner = await client.query('SELECT id FROM users WHERE email = $1 AND id <> $2', [
    deriveLoginEmail(name, false),
    ADMIN_USER_ID,
  ]);
  const email = deriveLoginEmail(name, Boolean(emailOwner.rows[0]));
  const passwordHash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10);

  await client.query(
    `INSERT INTO users (id, email, name, password_hash, role, department_id)
     VALUES ($1, $2, $3, $4, 'admin', NULL)
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       name = EXCLUDED.name,
       password_hash = EXCLUDED.password_hash,
       role = 'admin',
       department_id = NULL`,
    [ADMIN_USER_ID, email, name, passwordHash],
  );
  await client.query(
    `INSERT INTO user_settings (user_id, ai_model) VALUES ($1, $2)
     ON CONFLICT (user_id) DO NOTHING`,
    [ADMIN_USER_ID, ADMIN_SETTINGS_MODEL],
  );
  process.stdout.write('[seed-admin] upserted admin-001\n');
} finally {
  client.release();
  await pool.end();
}
