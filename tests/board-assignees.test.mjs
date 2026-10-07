import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(join(root, 'src/app/dashboard/page.tsx'), 'utf8');
const board = readFileSync(join(root, 'src/components/TaskBoard.tsx'), 'utf8');

describe('board assignees', () => {
  it('redirects admin before the live board and splits assignee lists', () => {
    assert.match(page, /user\.role === 'admin'/);
    assert.match(page, /redirect\('\/dashboard\/departments'\)/);
    assert.doesNotMatch(page, /useLiveTaskList/);

    const directoryAt = board.indexOf('/api/users?view=directory');
    const bossAt = board.lastIndexOf("user.role === 'boss'", directoryAt === -1 ? board.length : directoryAt);
    assert.ok(directoryAt !== -1 && bossAt !== -1 && bossAt < directoryAt);
    assert.equal(board.indexOf('/api/users?view=directory', directoryAt + 1), -1);

    assert.match(board, /<AssigneeSelect[\s\S]*?users=\{createUsers\}/);
    assert.doesNotMatch(board, /<AssigneeSelect[\s\S]*?users=\{directoryUsers\}/);
    assert.match(board, /<AssigneeSelect[^>]*users=\{reassignUsers\}/);
    assert.match(board, /`\/api\/tasks\/\$\{id\}\/assignees`/);
    assert.match(board, /noAssigneeAvailableMessage/);
    assert.match(board, /isBoss &&[\s\S]{0,500}assignee_department_name/);
    assert.match(board, /PushEnableBanner/);
    assert.match(board, /useLiveTaskList/);
  });
});
