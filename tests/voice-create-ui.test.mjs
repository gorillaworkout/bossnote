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
    assert.match(dashboard, /createTask = async \(overrideAssigneeId\?: string/);
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

describe('voice create unclear UX', () => {
  it('rejects unclear voice notes before insert, voice save, or notify', () => {
    assert.match(tasksRoute, /assessVoiceClarity\(ai, aiError\)/);
    assert.match(tasksRoute, /shouldInsertVoiceTask\(clarity, input\.confirmUnclear\)/);
    assert.match(tasksRoute, /voiceUnclearPayload\(clarity, aiError\)/);
    assert.doesNotMatch(tasksRoute, /Voice note — not transcribed yet/);

    const voicePath = tasksRoute.slice(tasksRoute.indexOf('const model = normalizeAudioModel'));
    const rejectIdx = voicePath.indexOf('shouldInsertVoiceTask');
    const saveIdx = voicePath.indexOf('saveVoice');
    const insertIdx = voicePath.indexOf('INSERT INTO tasks');
    const notifyIdx = voicePath.indexOf('notifyAssignee');
    assert.ok(rejectIdx !== -1 && saveIdx !== -1 && insertIdx !== -1 && notifyIdx !== -1);
    assert.ok(rejectIdx < saveIdx, 'unclear reject must run before saveVoice');
    assert.ok(rejectIdx < insertIdx, 'unclear reject must run before INSERT');
    assert.ok(rejectIdx < notifyIdx, 'unclear reject must run before Lark/push');
    assert.ok(saveIdx < insertIdx);
    assert.ok(insertIdx < notifyIdx);
  });

  it('keeps assignee_required after a confirmable draft is accepted', () => {
    const voicePath = tasksRoute.slice(tasksRoute.indexOf('const model = normalizeAudioModel'));
    const unclearIdx = voicePath.indexOf('shouldInsertVoiceTask');
    const assigneeIdx = voicePath.indexOf('ASSIGNEE_REQUIRED_CODE');
    assert.ok(unclearIdx !== -1 && assigneeIdx !== -1);
    assert.ok(unclearIdx < assigneeIdx, 'voice_unclear is checked before assignee_required');
  });

  it('shows a recovery modal with re-record, type, and optional keep-draft', () => {
    assert.match(dashboard, /isVoiceUnclearError/);
    assert.match(dashboard, /Couldn&apos;t understand this note/);
    assert.match(dashboard, /Re-record or type it/);
    assert.match(dashboard, /Keep this draft/);
    assert.match(dashboard, /Type it/);
    assert.match(dashboard, /form\.append\('confirm_unclear', '1'\)/);
    assert.match(dashboard, /setCreateMode\('typed'\)/);
    assert.match(dashboard, /setAudioBlob\(null\)/);
    const createFn = dashboard.slice(dashboard.indexOf('const createTask = async'));
    const typedFnStart = createFn.indexOf('const createTypedTask');
    const voiceCreate = typedFnStart === -1 ? createFn : createFn.slice(0, typedFnStart);
    assert.match(voiceCreate, /isVoiceUnclearError/);
    assert.match(voiceCreate, /isAssigneeRequiredError/);
    assert.ok(voiceCreate.indexOf('isVoiceUnclearError') < voiceCreate.indexOf('isAssigneeRequiredError'));
  });
});
