import { getDb, queryOne } from './database.ts';
import type { LarkLoginUser, LarkUserStore, NewLarkLogin } from './lark-login.ts';

type DbUser = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: string;
  department_id: string | null;
  lark_open_id: string | null;
  lark_email: string | null;
  auth_provider: string;
};

const USER_COLUMNS = `id, email, name, password_hash, role, department_id, lark_open_id, lark_email, auth_provider`;

function pgSql(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function mapUser(row: DbUser): LarkLoginUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    password_hash: row.password_hash,
    role: row.role,
    department_id: row.department_id ?? null,
    lark_open_id: row.lark_open_id ?? null,
    lark_email: row.lark_email ?? null,
    auth_provider: row.auth_provider,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && String((err as { code?: unknown }).code) === '23505');
}

export function createPgLarkUserStore(): LarkUserStore {
  return {
    async findAdminByOpenId(openId) {
      const row = await queryOne<DbUser>(
        `SELECT ${USER_COLUMNS} FROM users WHERE role = 'admin' AND lark_open_id = ? LIMIT 1`,
        [openId],
      );
      return row ? mapUser(row) : null;
    },
    async findLarkByOpenId(openId) {
      const row = await queryOne<DbUser>(
        `SELECT ${USER_COLUMNS} FROM users WHERE auth_provider = 'lark' AND lark_open_id = ? LIMIT 1`,
        [openId],
      );
      return row ? mapUser(row) : null;
    },
    async nameTaken(name) {
      const row = await queryOne('SELECT id FROM users WHERE LOWER(name) = LOWER(?) LIMIT 1', [name]);
      return Boolean(row);
    },
    async emailTaken(email) {
      const row = await queryOne('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
      return Boolean(row);
    },
    async updateLarkEmail(id, larkEmail) {
      await queryOne(
        `UPDATE users SET lark_email = ? WHERE id = ? AND auth_provider = 'lark' RETURNING id`,
        [larkEmail, id],
      );
    },
    async insertLarkUser(row: NewLarkLogin) {
      const client = await getDb().connect();
      try {
        await client.query('BEGIN');
        await client.query(
          pgSql(
            `INSERT INTO users
              (id, email, name, password_hash, role, department_id, lark_open_id, lark_email, auth_provider)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ),
          [
            row.id,
            row.email,
            row.name,
            row.password_hash,
            row.role,
            row.department_id,
            row.lark_open_id,
            row.lark_email,
            row.auth_provider,
          ],
        );
        await client.query(
          pgSql('INSERT INTO user_settings (user_id, ai_model) VALUES (?, ?)'),
          [row.id, row.settingsModel],
        );
        await client.query('COMMIT');
        return 'inserted';
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch {
          /* the connection is already aborting */
        }
        if (isUniqueViolation(err)) return 'conflict';
        throw err;
      } finally {
        client.release();
      }
    },
  };
}
