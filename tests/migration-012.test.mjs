import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '012_lark_login.sql'),
  'utf8',
);

describe('migrations/012_lark_login.sql', () => {
  it('adds Lark login columns and lets a member have no department', () => {
    const markers = [
      'ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT \'password\'',
      'users_auth_provider_check',
      "auth_provider IN ('password', 'lark')",
      'ADD COLUMN IF NOT EXISTS lark_email TEXT NULL',
      'DROP CONSTRAINT IF EXISTS users_department_role_check',
      'users_department_role_check',
      "role = 'admin' AND department_id IS NULL",
      "role = 'boss' AND department_id IS NOT NULL",
      "role = 'member'",
      'users_admin_password_only_check',
      "role <> 'admin' OR auth_provider = 'password'",
      'users_lark_login_open_id_idx',
      'WHERE auth_provider = \'lark\' AND lark_open_id IS NOT NULL',
    ];
    let at = -1;
    for (const marker of markers) {
      const next = sql.indexOf(marker);
      assert.ok(next > at, `missing or out of order: ${marker}`);
      at = next;
    }
    assert.equal(sql.includes("role IN ('boss', 'member') AND department_id IS NOT NULL"), false);
  });

  it('does not insert users, open ids, or secrets', () => {
    assert.equal(sql.includes('admin-001'), false);
    assert.equal(sql.includes('boss-001'), false);
    assert.equal(sql.includes('INSERT INTO'), false);
    assert.equal(sql.includes('password_hash'), false);
    assert.equal(/\$2[aby]\$/.test(sql), false);
    assert.equal(sql.includes('LARK_TENANT_KEY'), false);
    assert.equal(sql.includes('LARK_APP_SECRET'), false);
  });
});
