import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const page = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src/app/dashboard/users/page.tsx'),
  'utf8',
);

describe('manage users page', () => {
  it('requires a department and limits the admin row', () => {
    for (const text of [
      'The admin creates each person, picks Boss or Staff, and places them in a department.',
      'Create a department first.',
      'Their visible tasks and allowed assignees follow the new role and department immediately.',
      'department_id',
      '/api/admin/departments',
      "d.user.role !== 'admin'",
    ]) {
      assert.ok(page.includes(text), text);
    }
    assert.doesNotMatch(page, /Cannot demote the last boss/);
    assert.doesNotMatch(page, /bossCount <= 1/);
    assert.match(page, /u\.role !== 'admin'/);
    assert.match(page, /editing\.role === 'admin'/);
  });
});
