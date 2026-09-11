import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dashboard = readFileSync(join(root, 'src/app/dashboard/page.tsx'), 'utf8');
const tasksRoute = readFileSync(join(root, 'src/app/api/tasks/route.ts'), 'utf8');

describe('voice create assignee UX', () => {
  it('keeps the recording and opens a picker modal when assignee is missing', () => {
    assert.match(dashboard, /Who is this task for\?/);
    assert.match(dashboard, /your recording is kept/);
    assert.match(dashboard, /isAssigneeRequiredError/);
    assert.match(dashboard, /setNeedAssignee\(true\)/);
    assert.match(dashboard, /createTask = async \(overrideAssigneeId\?: string\)/);
    assert.match(dashboard, /if \(chosenAssignee\) form\.append\('assignee_id', chosenAssignee\)/);
    assert.doesNotMatch(dashboard, /if \(!audioBlob \|\| !assigneeId/);
  });

  it('shows a Creating loader and blocks double submit while create is in flight', () => {
    assert.match(dashboard, /createInFlightRef/);
    assert.match(dashboard, /beginCreate/);
    assert.match(dashboard, /Creating…/);
    assert.match(dashboard, /Please wait — do not tap again/);
    assert.match(dashboard, /disabled=\{processing\}/);
    assert.match(dashboard, /if \(processing\) return/);
    const createFn = dashboard.slice(dashboard.indexOf('const createTask = async'));
    const typedFnStart = createFn.indexOf('const createTypedTask');
    const voiceCreate = typedFnStart === -1 ? createFn : createFn.slice(0, typedFnStart);
    assert.match(voiceCreate, /createInFlightRef\.current/);
    assert.match(dashboard, /const createTypedTask = async/);
    const typedCreate = dashboard.slice(dashboard.indexOf('const createTypedTask = async'));
    assert.match(typedCreate, /createInFlightRef\.current/);
  });

  it('does not require an assignee before the first voice submit', () => {
    assert.match(dashboard, /autoLabel="Auto from voice"/);
    assert.match(dashboard, /Assign to \(optional\)/);
    const createFn = dashboard.slice(dashboard.indexOf('const createTask = async'));
    const typedFnStart = createFn.indexOf('const createTypedTask');
    const voiceCreate = typedFnStart === -1 ? createFn : createFn.slice(0, typedFnStart);
    assert.doesNotMatch(voiceCreate, /if \(!assigneeId/);
  });

  it('prefers form assignee on the voice create API path', () => {
    assert.match(tasksRoute, /resolveCreateAssignee\(input\.formAssigneeId, ai\?\.assignee_hint, team\)/);
    assert.match(tasksRoute, /ASSIGNEE_REQUIRED_CODE/);
    assert.doesNotMatch(tasksRoute, /fromVoice\?\.id \|\| formUser\?\.id/);
  });

  it('passes stored Lark open ids into fire-and-forget notify', () => {
    assert.match(tasksRoute, /SELECT id, name, lark_open_id FROM users/);
    assert.match(tasksRoute, /assigneeOpenId: formUser\.lark_open_id/);
    assert.match(tasksRoute, /assigneeOpenId: assignee\.lark_open_id/);
  });
});
