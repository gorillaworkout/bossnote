import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dashboard = readFileSync(join(root, 'src/app/dashboard/page.tsx'), 'utf8');
const account = readFileSync(join(root, 'src/app/dashboard/account/page.tsx'), 'utf8');
const route = readFileSync(join(root, 'src/app/api/tasks/route.ts'), 'utf8');
const banner = readFileSync(join(root, 'src/components/PushEnableBanner.tsx'), 'utf8');

describe('board shell', () => {
  it('locks the dashboard to the viewport so the header does not scroll away', () => {
    assert.match(dashboard, /h-dvh max-h-dvh overflow-hidden/);
    assert.match(dashboard, /flex-1 min-h-0 flex overflow-hidden/);
    assert.match(dashboard, /min-h-0 overflow-y-auto/);
    assert.doesNotMatch(dashboard, /min-h-screen bg-\[var\(--bg\)\] flex flex-col text-\[15px\]/);
    assert.doesNotMatch(dashboard, /55%/);
  });

  it('opens a task in an overlay and puts the id in the URL', () => {
    assert.match(dashboard, /taskShareHref/);
    assert.match(dashboard, /href=\{taskShareHref\(taskScope, task\.id\)\}/);
    assert.match(dashboard, /loadTaskDetail\(task\.id, 'push'\)/);
    assert.match(dashboard, /aria-label="Close task details"/);
    assert.match(dashboard, /hidden sm:flex fixed inset-0 z-40/);
    assert.match(dashboard, /popstate/);
    assert.match(dashboard, /taskHiddenByFilters/);
  });

  it('dedupes creates and keeps the question count off the status filter', () => {
    assert.match(dashboard, /client_token/);
    assert.match(dashboard, /needsConfirmationOnly \? pendingTasks : tasks/);
    assert.doesNotMatch(dashboard, /params\.set\('status', filterStatus\)/);
    const post = route.slice(route.indexOf('export async function POST'));
    assert.ok(post.indexOf('completeCreateClaim') < post.indexOf('notifyAssignee'));
    assert.match(route, /beginCreateClaim/);
    assert.match(route, /dedupeTasksById/);
  });
});

describe('header polish', () => {
  it('moves the model picker to Account and keeps push copy platform-specific', () => {
    assert.doesNotMatch(dashboard, /value=\{aiModel\}/);
    assert.match(account, /Voice model/);
    assert.match(account, /\/api\/settings\/model/);
    assert.match(banner, /pushDeniedCopy\(platform\)/);
    assert.doesNotMatch(banner, /On iPhone open Settings/);
    assert.match(dashboard, /If voice isn't available, use Type instead/);
    assert.match(dashboard, /bg-violet-600 hover:bg-violet-500 text-white/);
    assert.match(dashboard, /distinctSummary/);
    assert.match(dashboard, /priorityLabel/);
  });
});
