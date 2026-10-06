import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dashboard = readFileSync(join(root, 'src/app/dashboard/page.tsx'), 'utf8');
const buttons = readFileSync(join(root, 'src/components/StatusButtons.tsx'), 'utf8');
const statusFilter = readFileSync(join(root, 'src/components/StatusFilter.tsx'), 'utf8');

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `missing ${startMarker}`);
  assert.ok(end > start, `missing ${endMarker} after ${startMarker}`);
  return source.slice(start, end);
}

describe('status buttons', () => {
  it('renders every status as a button with a pressed state for the current one', () => {
    assert.match(buttons, /role="group"/);
    assert.match(buttons, /aria-label="Task status"/);
    assert.match(buttons, /aria-pressed=\{active\}/);
    assert.match(buttons, /<button/);
    assert.doesNotMatch(buttons, /<select/);
    assert.match(buttons, /stopPropagation/);
    assert.match(buttons, /TASK_STATUSES/);
    assert.match(buttons, /size === 'compact' \? status\.shortLabel : status\.label/);
  });

  it('replaces the status dropdown on the board card and the task detail', () => {
    const card = sliceBetween(dashboard, 'const renderKanbanCard', 'const renderDetailContent');
    const detail = sliceBetween(dashboard, 'const renderDetailContent', 'RENDER');
    assert.match(dashboard, /import \{ StatusButtons \} from '@\/components\/StatusButtons'/);
    assert.match(card, /<StatusButtons/);
    assert.match(card, /size="compact"/);
    assert.match(detail, /<StatusButtons/);
    assert.doesNotMatch(card, /<select/);
    assert.doesNotMatch(detail, /<select value=\{t\.status\}/);
    assert.doesNotMatch(dashboard, /<select value=\{t\.status\}/);
    assert.doesNotMatch(dashboard, /All status/);
  });

  it('filters the toolbar by status with buttons instead of a dropdown', () => {
    const toolbar = sliceBetween(dashboard, 'TOOLBAR', 'BODY');
    assert.match(dashboard, /import \{ StatusFilter \} from '@\/components\/StatusFilter'/);
    assert.match(toolbar, /<StatusFilter value=\{filterStatus\} onChange=\{setFilterStatus\} \/>/);
    assert.match(toolbar, /<select value=\{filterAssignee\}/);
    assert.doesNotMatch(toolbar, /<select value=\{filterStatus\}/);
    assert.doesNotMatch(toolbar, /All status/);
    assert.match(statusFilter, /role="group"/);
    assert.match(statusFilter, /aria-label="Filter by status"/);
    assert.match(statusFilter, /aria-pressed/);
    assert.match(statusFilter, />\s*All\s*</);
    assert.match(statusFilter, /TASK_STATUSES/);
    assert.match(statusFilter, /\{status\.label\}/);
    assert.doesNotMatch(statusFilter, /<select/);
    assert.match(dashboard, /if \(filterStatus\) params\.set\('status', filterStatus\)/);
  });

  it('still saves status with the existing task update request', () => {
    const update = sliceBetween(dashboard, 'const updateStatus', 'const reassignTask');
    assert.match(update, /method: 'PUT'/);
    assert.match(update, /JSON\.stringify\(\{ status \}\)/);
    assert.match(update, /setTasks/);
    assert.match(update, /setSelectedTask/);
  });
});
