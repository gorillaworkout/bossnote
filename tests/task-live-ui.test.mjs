import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dashboard = readFileSync(join(root, 'src/app/dashboard/page.tsx'), 'utf8');
const createRoute = readFileSync(join(root, 'src/app/api/tasks/route.ts'), 'utf8');
const taskRoute = readFileSync(join(root, 'src/app/api/tasks/[id]/route.ts'), 'utf8');
const streamRoute = readFileSync(join(root, 'src/app/api/tasks/stream/route.ts'), 'utf8');

describe('live task list', () => {
  it('keeps an open dashboard subscribed and refetches on a task event', () => {
    assert.match(dashboard, /new EventSource\(TASK_STREAM_PATH\)/);
    assert.match(dashboard, /addEventListener\('tasks'/);
    assert.match(dashboard, /fetchTasksRef\.current\(\)/);
    assert.match(dashboard, /visibilitychange/);
    assert.match(dashboard, /TASK_LIST_POLL_MS/);
    assert.match(dashboard, /shouldManuallyReconnectEventSource/);
  });

  it('publishes after create, reassign, status, and delete', () => {
    assert.equal((createRoute.match(/publishTaskListChangeSafe\(/g) || []).length, 2);
    assert.match(taskRoute, /previous_assignee_id: String\(task\.assignee_id\)/);
    assert.match(taskRoute, /UPDATE tasks SET status/);
    assert.match(taskRoute, /DELETE FROM tasks/);
    assert.match(streamRoute, /text\/event-stream/);
    assert.match(streamRoute, /taskChangeRelevant/);
    assert.match(streamRoute, /subscribeTaskChanges/);
  });
});
