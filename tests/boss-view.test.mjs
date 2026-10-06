import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dashboard = readFileSync(join(root, 'src/app/dashboard/page.tsx'), 'utf8');
const imageField = readFileSync(join(root, 'src/components/TaskImageField.tsx'), 'utf8');
const screenshot = readFileSync(join(root, 'src/components/TaskScreenshot.tsx'), 'utf8');
const tasksRoute = readFileSync(join(root, 'src/app/api/tasks/route.ts'), 'utf8');
const taskListScope = readFileSync(join(root, 'src/lib/task-list-scope.ts'), 'utf8');
const taskRoute = readFileSync(join(root, 'src/app/api/tasks/[id]/route.ts'), 'utf8');
const imageRoute = readFileSync(join(root, 'src/app/api/tasks/[id]/image/route.ts'), 'utf8');
const push = readFileSync(join(root, 'src/lib/push.ts'), 'utf8');
const banner = readFileSync(join(root, 'src/components/PushEnableBanner.tsx'), 'utf8');
const sw = readFileSync(join(root, 'public/sw.js'), 'utf8');

describe('boss assigned-to-me board', () => {
  it('defaults bosses to their own assignments and labels Boss accounts', () => {
    assert.match(dashboard, /resolveTaskListScope/);
    assert.match(taskListScope, /if \(!user \|\| user\.role === 'boss'\) return 'assigned'/);
    assert.match(taskListScope, /Assigned to me/);
    assert.match(taskListScope, /Created by me/);
    assert.match(dashboard, /assigneeOptionLabel/);
    assert.match(dashboard, /optgroup label="Boss"/);
  });

  it('offers Assigned, Created by me, and All without leaking other members tasks', () => {
    assert.match(dashboard, /role="tablist"/);
    assert.match(dashboard, /aria-label="Tasks"/);
    assert.match(dashboard, /taskListScopeLabel/);
    assert.match(dashboard, /emptyTaskScopeMessage/);
    assert.match(dashboard, /TASK_LIST_SCOPE_STORAGE_KEY/);
    assert.match(dashboard, /params\.set\('scope', taskScope\)/);
    assert.match(dashboard, /taskScope === 'all'/);
    assert.match(taskListScope, /No tasks created by you/);
    assert.match(taskListScope, /No tasks assigned to you/);
    assert.match(taskListScope, /\(t\.assignee_id = \? OR t\.created_by = \?\)/);
    assert.match(tasksRoute, /buildTaskListQuery/);
    assert.match(tasksRoute, /searchParams\.get\('scope'\)/);
  });
});

describe('task screenshot', () => {
  it('shows the photo on the card and on the task detail', () => {
    assert.match(dashboard, /alt="Screenshot"/);
    assert.match(dashboard, /TaskScreenshot/);
    assert.match(imageField, /Screenshot \(optional\)/);
    assert.match(screenshot, /Add screenshot/);
    assert.match(imageField, /the task is still saved and you can retry/);
    assert.match(imageRoute, /canViewTask/);
    assert.match(imageRoute, /saveTaskImage/);
    assert.match(taskRoute, /canViewTask/);
  });

  it('does not require a photo to create the task', () => {
    assert.match(dashboard, /attachImageIfAny/);
    assert.doesNotMatch(tasksRoute, /image is required/i);
    const voiceInsert = tasksRoute.indexOf('const model = normalizeAudioModel');
    const imageWord = tasksRoute.indexOf('image');
    assert.equal(imageWord, -1, 'create route stays free of image handling so a photo failure cannot roll back insert');
    assert.ok(voiceInsert > 0);
  });
});

describe('push delivery', () => {
  it('sends the assignment to every stored endpoint and deep-links the task', () => {
    assert.match(push, /uniqueSubscriptions/);
    assert.match(push, /WHERE user_id = \?/);
    assert.doesNotMatch(push, /LIMIT 1/);
    assert.match(tasksRoute, /assignmentPushUrl\(taskId\)/);
    assert.match(taskRoute, /assignmentPushUrl\(id\)/);
    assert.match(taskRoute, /kind: 'reassign'/);
    assert.match(banner, /Add to Home Screen/);
    assert.match(banner, /Enable Push/);
    assert.match(banner, /other devices stay registered/);
  });

  it('still leaves /api/ and navigations unhandled so bn_token is not dropped', () => {
    assert.match(sw, /pathname\.startsWith\('\/api\/'\)\) return/);
    assert.match(sw, /mode === 'navigate'\) return/);
    assert.match(sw, /bossnote-v8/);
  });
});
