import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TASK_STATUSES, isTaskStatus } from './task-status.ts';

describe('task statuses', () => {
  it('keeps the stored enum and the labels the board already uses', () => {
    assert.deepEqual(
      TASK_STATUSES.map((status) => status.value),
      ['todo', 'in_progress', 'waiting', 'done'],
    );
    assert.deepEqual(
      TASK_STATUSES.map((status) => status.label),
      ['To Do', 'In Progress', 'Stuck', 'Done'],
    );
    assert.deepEqual(
      TASK_STATUSES.map((status) => status.shortLabel),
      ['To Do', 'In Progress', 'Stuck', 'Done'],
    );
    assert.equal(isTaskStatus('waiting'), true);
    assert.equal(isTaskStatus('blocked'), false);
  });
});
