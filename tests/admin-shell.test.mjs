import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('admin shell', () => {
  it('sends a signed-in admin to manage departments', () => {
    const page = read('src/app/page.tsx');
    const login = read('src/components/LoginForm.tsx');
    assert.match(page, /homePathForRole/);
    assert.match(login, /homePathForRole\(data\.user\?\.role\)/);
    assert.doesNotMatch(login, /router\.push\('\/dashboard'\)/);
  });

  it('shows manage links only to the admin', () => {
    const header = read('src/components/DashboardHeader.tsx');
    assert.match(header, /Admin/);
    assert.match(header, /Manage Departments/);
    assert.match(header, /Team/);
    const adminNav = header.slice(header.indexOf("user.role === 'admin'"));
    assert.match(adminNav, /Manage Users/);
    assert.doesNotMatch(header.slice(0, header.indexOf("user.role === 'admin'")), /Manage Users/);
  });

  it('keeps department and user pages admin-only', () => {
    const users = read('src/app/dashboard/users/layout.tsx');
    const departments = read('src/app/dashboard/departments/layout.tsx');
    const dashboard = read('src/app/dashboard/layout.tsx');
    for (const source of [users, departments]) {
      assert.match(source, /user\.role !== 'admin'/);
      assert.match(source, /redirect\('\/dashboard'\)/);
      assert.doesNotMatch(source, /user\.role === 'admin'[\s\S]{0,80}redirect\(/);
    }
    assert.match(dashboard, /getSession\(\)/);
    assert.doesNotMatch(dashboard, /role/);
  });
});
