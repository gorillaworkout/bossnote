import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const dashboard = readFileSync(new URL('../src/components/TaskBoard.tsx', import.meta.url), 'utf8');
const hook = readFileSync(new URL('../src/components/use-live-task-list.ts', import.meta.url), 'utf8');
const eventsRoute = readFileSync(new URL('../src/app/api/tasks/events/route.ts', import.meta.url), 'utf8');
const tasksRoute = readFileSync(new URL('../src/app/api/tasks/route.ts', import.meta.url), 'utf8');
const taskRoute = readFileSync(new URL('../src/app/api/tasks/[id]/route.ts', import.meta.url), 'utf8');
const replyRoute = readFileSync(new URL('../src/app/api/tasks/[id]/reply/route.ts', import.meta.url), 'utf8');
const retranscribeRoute = readFileSync(new URL('../src/app/api/tasks/[id]/retranscribe/route.ts', import.meta.url), 'utf8');
const imageRoute = readFileSync(new URL('../src/app/api/tasks/[id]/image/route.ts', import.meta.url), 'utf8');
const imageIndexRoute = readFileSync(new URL('../src/app/api/tasks/[id]/image/[index]/route.ts', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

describe('live task list wiring', () => {
  it('keeps an open dashboard subscribed and refetching with the current filters', () => {
    assert.match(dashboard, /useLiveTaskList\(/);
    assert.match(dashboard, /from '@\/lib\/task-list-live'/);
    assert.doesNotMatch(dashboard, /from '@\/lib\/task-live'/);
    assert.match(hook, /from '@\/lib\/task-list-live'/);
    assert.doesNotMatch(hook, /from '@\/lib\/task-live'/);
    assert.match(dashboard, /params\.set\('scope', taskScope\)/);
    assert.match(dashboard, /mergeLiveTaskList/);
    assert.match(dashboard, /cache: 'no-store'/);
    assert.match(hook, /new EventSource\(TASK_EVENTS_PATH/);
    assert.match(hook, /addEventListener\('tasks'/);
    assert.match(hook, /visibilitychange/);
    assert.match(hook, /onopen/);
    assert.doesNotMatch(hook, /setInterval\(\s*\(\)\s*=>\s*\{[^}]*fetch\(`\/api\/tasks/);
  });

  it('serves an authenticated SSE stream the proxy must not buffer', () => {
    assert.match(eventsRoute, /getSession\(/);
    assert.match(eventsRoute, /Unauthorized/);
    assert.match(eventsRoute, /createTaskListEventStream/);
    assert.match(eventsRoute, /ensureTaskListDbListener/);
    assert.match(eventsRoute, /text\/event-stream/);
    assert.match(eventsRoute, /X-Accel-Buffering/);
    assert.match(eventsRoute, /no-cache, no-transform/);
    assert.match(eventsRoute, /export const dynamic = 'force-dynamic'/);
    assert.match(eventsRoute, /export const runtime = 'nodejs'/);
  });

  it('publishes after creates, reassigns, and other task writes', () => {
    assert.match(tasksRoute, /publishTaskListChange\(\)/);
    assert.equal((taskRoute.match(/publishTaskListChange\(\)/g) || []).length, 3);
    assert.match(replyRoute, /publishTaskListChange\(\)/);
    assert.match(retranscribeRoute, /publishTaskListChange\(\)/);
    assert.match(imageRoute, /publishTaskListChange\(\)/);
    assert.match(imageIndexRoute, /publishTaskListChange\(\)/);
  });

  it('documents the SSE path and the Oracle nginx proxy', () => {
    assert.match(readme, /\/api\/tasks\/events/);
    assert.match(readme, /text\/event-stream/);
    assert.match(readme, /proxy_buffering off/);
    assert.match(readme, /X-Accel-Buffering/);
    assert.match(readme, /one Node process/);
  });
});
