import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { requireAdmin } from '../src/lib/require-admin.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('requireAdmin', () => {
  it('rejects a logged-out caller and a boss', () => {
    const anon = requireAdmin(null, 'Only an admin can manage departments');
    assert.equal(anon?.status, 401);
    const boss = requireAdmin({ role: 'boss' }, 'Only an admin can manage departments');
    assert.equal(boss?.status, 403);
    assert.equal(requireAdmin({ role: 'admin' }, 'Only an admin can manage departments'), null);
  });
});

describe('department route sources', () => {
  const list = read('src/app/api/admin/departments/route.ts');
  const item = read('src/app/api/admin/departments/[id]/route.ts');
  const both = `${list}\n${item}`;

  it('lists counts, rejects duplicate names, and blocks a delete that still has people', () => {
    assert.match(both, /requireAdmin/);
    assert.match(both, /Only an admin can manage departments/);
    assert.match(both, /LOWER\(name\) = LOWER\(\?\)/);
    assert.match(list, /COUNT\(\*\) FILTER \(WHERE u\.role = 'boss'\)/);
    assert.match(list, /COUNT\(\*\) FILTER \(WHERE u\.role = 'member'\)/);
    assert.match(item, /DEPARTMENT_IN_USE_ERROR/);
    assert.match(item, /SELECT COUNT\(\*\)::int AS n FROM users WHERE department_id = \?/);
    assert.match(both, /409/);
    assert.match(item, /404/);
    assert.match(both, /400/);
    assert.match(list, /201/);
  });
});
