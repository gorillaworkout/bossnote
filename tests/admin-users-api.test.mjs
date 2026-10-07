import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('admin user routes', () => {
  const users = read('src/app/api/admin/users/route.ts');
  const item = read('src/app/api/admin/users/[id]/route.ts');
  const password = read('src/app/api/auth/password/route.ts');
  const both = `${users}\n${item}`;

  it('lets only an admin manage users and drops the last-boss rule', () => {
    assert.match(both, /requireAdmin\([\s\S]*Only an admin can manage users/);
    assert.doesNotMatch(both, /Only a boss can manage users/);
    assert.doesNotMatch(both, /Cannot demote the last boss/);
    assert.doesNotMatch(both, /Cannot delete the last boss/);
    assert.match(users, /u\.department_id/);
    assert.match(users, /d\.name AS department_name/);
    assert.match(users, /LEFT JOIN departments d/);
    assert.match(users, /ORDER BY LOWER\(u\.name\)/);
    assert.match(users, /validateCreateUser/);
    assert.match(users, /deriveLoginEmail/);
    assert.match(users, /department_id/);
    assert.match(users, /user_settings/);
    assert.match(item, /validateUpdateUser/);
    assert.match(item, /Department not found/);
    assert.match(item, /status: 400/);
    assert.match(item, /department_id/);
    assert.match(item, /deleteUserBlock/);
  });

  it('makes password reset admin-only and keeps self-service on PUT', () => {
    const post = password.slice(password.indexOf('export async function POST'));
    const put = password.slice(password.indexOf('export async function PUT'), password.indexOf('export async function POST'));
    assert.match(post, /user\.role !== 'admin'/);
    assert.match(post, /Only an admin can reset passwords/);
    assert.match(post, /Use Account to change your own password\./);
    assert.match(post, /status: 400/);
    assert.match(put, /current_password/);
    assert.doesNotMatch(put, /role !== 'admin'/);
  });
});
