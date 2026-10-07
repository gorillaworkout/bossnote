import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('assignee lists', () => {
  it('serves create candidates and a boss-only directory', () => {
    const users = read('src/app/api/users/route.ts');
    assert.match(users, /searchParams\.get\('view'\)/);
    assert.match(users, /candidateListQuery/);
    assert.match(users, /role IN \('boss', 'member'\)/);
    assert.match(users, /user\.role === 'admin'/);
    assert.doesNotMatch(users, /getUsers\(/);
  });

  it('serves reassign candidates for one visible task', () => {
    const route = read('src/app/api/tasks/[id]/assignees/route.ts');
    assert.match(route, /canViewTask/);
    assert.match(route, /canReassign/);
    assert.match(route, /candidateListQuery/);
  });
});
