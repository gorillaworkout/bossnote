import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const page = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src/app/dashboard/departments/page.tsx'),
  'utf8',
);

describe('manage departments page', () => {
  it('lists counts and does not open the task stream', () => {
    assert.match(page, /Manage Departments/);
    assert.match(page, /\/api\/admin\/departments/);
    assert.match(page, /boss_count/);
    assert.match(page, /member_count/);
    assert.match(page, /confirmDelete/);
    assert.doesNotMatch(page, /PushEnableBanner/);
    assert.doesNotMatch(page, /useLiveTaskList/);
  });
});
