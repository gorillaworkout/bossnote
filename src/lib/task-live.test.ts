import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatTaskStreamEvent,
  formatTaskStreamHello,
  parseTaskListChange,
  shouldManuallyReconnectEventSource,
  taskChangeRelevant,
  TASK_STREAM_RETRY_MS,
} from './task-live.ts';

const bayu = { id: 'bayu-001', role: 'member' };
const ian = { id: 'boss-001', role: 'boss' };

describe('taskChangeRelevant', () => {
  const change = {
    assignee_id: 'bayu-001',
    created_by: 'sandra-001',
    previous_assignee_id: 'member-old',
  };

  it('refreshes the assignee, the creator, the previous assignee, and every boss', () => {
    assert.equal(taskChangeRelevant(bayu, change), true);
    assert.equal(taskChangeRelevant({ id: 'sandra-001', role: 'member' }, change), true);
    assert.equal(taskChangeRelevant({ id: 'member-old', role: 'member' }, change), true);
    assert.equal(taskChangeRelevant(ian, change), true);
    assert.equal(taskChangeRelevant({ id: 'someone-else', role: 'member' }, change), false);
  });

  it('still refreshes a boss when they are not on the task', () => {
    assert.equal(taskChangeRelevant(ian, {
      assignee_id: 'bayu-001',
      created_by: 'sandra-001',
      previous_assignee_id: null,
    }), true);
  });
});

describe('task stream frames', () => {
  it('asks the browser to retry and names the task event', () => {
    assert.match(formatTaskStreamHello(), new RegExp(`retry: ${TASK_STREAM_RETRY_MS}`));
    const frame = formatTaskStreamEvent({ id: 'task-1' });
    assert.match(frame, /^event: tasks\n/);
    assert.match(frame, /"id":"task-1"/);
    assert.match(frame, /\n\n$/);
  });

  it('parses a notify payload and drops junk', () => {
    const parsed = parseTaskListChange(JSON.stringify({
      id: 'task-1',
      assignee_id: 'bayu-001',
      created_by: 'boss-001',
      previous_assignee_id: null,
    }));
    assert.deepEqual(parsed, {
      id: 'task-1',
      assignee_id: 'bayu-001',
      created_by: 'boss-001',
      previous_assignee_id: null,
    });
    assert.equal(parseTaskListChange('nope'), null);
    assert.equal(parseTaskListChange(JSON.stringify({ id: 'x' })), null);
  });

  it('only forces a new EventSource after the browser has given up', () => {
    assert.equal(shouldManuallyReconnectEventSource(0), false);
    assert.equal(shouldManuallyReconnectEventSource(1), false);
    assert.equal(shouldManuallyReconnectEventSource(2), true);
  });
});
