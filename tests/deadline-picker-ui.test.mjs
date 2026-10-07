import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dashboard = readFileSync(join(root, 'src/components/TaskBoard.tsx'), 'utf8');
const field = readFileSync(join(root, 'src/components/DeadlineField.tsx'), 'utf8');

describe('typed create deadline picker', () => {
  it('uses an in-app calendar on the create form instead of a native date input', () => {
    const typedStart = dashboard.indexOf('Type reminder');
    const typedEnd = dashboard.indexOf('Create Reminder');
    assert.ok(typedStart !== -1 && typedEnd > typedStart);
    const typed = dashboard.slice(typedStart, typedEnd);
    assert.match(typed, /<DeadlineField/);
    assert.match(typed, /value=\{typedDeadline\}/);
    assert.match(typed, /onChange=\{setTypedDeadline\}/);
    assert.doesNotMatch(typed, /type="date"/);
    assert.doesNotMatch(dashboard, /type="date"/);

    assert.match(field, /aria-label="Choose deadline"/);
    assert.match(field, /Pick a date/);
    assert.match(field, /role="grid"/);
    assert.match(field, /aria-label="Previous month"/);
    assert.match(field, /aria-label="Next month"/);
    assert.match(field, /Clear/);
    assert.match(field, /createPortal/);
    assert.match(field, /fixed z-\[80\]/);
    assert.match(field, /role="dialog"/);
    assert.doesNotMatch(field, /col-span-2/);
    assert.match(field, /min-h-11/);
    assert.match(field, /onChange\(cell\.iso\)/);
    assert.match(field, /onChange\(''\)/);
    assert.doesNotMatch(field, /<input/);
    assert.doesNotMatch(field, /type="date"/);
  });

  it('still submits an optional deadline and leaves it off when empty', () => {
    const typedCreate = dashboard.slice(dashboard.indexOf('const createTypedTask = async'));
    assert.match(typedCreate, /if \(typedDeadline\) form\.append\('deadline', typedDeadline\)/);
    assert.match(typedCreate, /form\.append\('text'/);
  });
});
