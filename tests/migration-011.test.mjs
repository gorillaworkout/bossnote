import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '011_departments.sql'),
  'utf8',
);

describe('migrations/011_departments.sql', () => {
  it('creates departments, seeds General, then constrains users', () => {
    const markers = [
      'CREATE TABLE IF NOT EXISTS departments',
      "('dept-general', 'General')",
      'ADD COLUMN IF NOT EXISTS department_id',
      'ON DELETE RESTRICT',
      "SET department_id = 'dept-general'",
      "role IN ('boss', 'member')",
      'DROP CONSTRAINT IF EXISTS users_role_check',
      "role IN ('admin', 'boss', 'member')",
      'users_department_role_check',
      "role = 'admin' AND department_id IS NULL",
      "role IN ('boss', 'member') AND department_id IS NOT NULL",
      'idx_users_department',
      'departments_name_lower_idx',
      'LOWER(name)',
    ];
    let at = -1;
    for (const marker of markers) {
      const next = sql.indexOf(marker);
      assert.ok(next > at, `missing or out of order: ${marker}`);
      at = next;
    }
  });

  it('does not insert the admin or any password hash', () => {
    assert.equal(sql.includes('admin-001'), false);
    assert.equal(sql.includes('password_hash'), false);
    assert.equal(/\$2[aby]\$/.test(sql), false);
    assert.equal(sql.includes('ADMIN_PASSWORD'), false);
  });
});
