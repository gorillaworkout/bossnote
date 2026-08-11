import { Pool } from 'pg';

let pool: Pool | undefined;

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is required');
  return value;
}

export function getDb(): Pool {
  if (!pool) pool = new Pool({ connectionString: databaseUrl() });
  return pool;
}

function pgSql(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

export async function queryOne<T = Record<string, unknown>>(sql: string, values: unknown[] = []): Promise<T | undefined> {
  const result = await getDb().query<T & Record<string, unknown>>(pgSql(sql), values);
  return result.rows[0];
}

export async function queryAll<T = Record<string, unknown>>(sql: string, values: unknown[] = []): Promise<T[]> {
  const result = await getDb().query<T & Record<string, unknown>>(pgSql(sql), values);
  return result.rows;
}

export async function execute(sql: string, values: unknown[] = []): Promise<number> {
  const result = await getDb().query(pgSql(sql), values);
  return result.rowCount ?? 0;
}
