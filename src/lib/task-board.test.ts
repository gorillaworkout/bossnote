import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { boardColumns, dedupeTasksById, taskHiddenByFilters, taskShareHref } from './task-board.ts';

describe('dedupeTasksById', () => {
  it('keeps the first row when a live refetch repeats the same task id', () => {
    const tasks = dedupeTasksById([
      { id: 'a', title: 'Create FM asset request' },
      { id: 'a', title: 'Create FM asset request' },
      { id: 'b', title: 'Other' },
    ]);
    assert.deepEqual(tasks.map((task) => task.id), ['a', 'b']);
  });
});

describe('boardColumns', () => {
  it('shows every column until one status chip is selected', () => {
    assert.deepEqual(boardColumns('').map((status) => status.value), ['todo', 'in_progress', 'waiting', 'done']);
    assert.deepEqual(boardColumns('waiting').map((status) => status.value), ['waiting']);
    assert.deepEqual(boardColumns('nope').map((status) => status.value), ['todo', 'in_progress', 'waiting', 'done']);
  });
});

describe('taskHiddenByFilters', () => {
  const todo = {
    id: 't1',
    status: 'todo',
    title: 'Need to send automatically to email',
    title_id: 'Kirim email',
    questions: ['Which inbox?'],
    answered_questions: [],
  };

  it('closes a task the active status or search no longer shows', () => {
    assert.equal(taskHiddenByFilters(todo, { status: 'waiting' }), true);
    assert.equal(taskHiddenByFilters(todo, { status: 'todo' }), false);
    assert.equal(taskHiddenByFilters(todo, { status: '' }), false);
    assert.equal(taskHiddenByFilters(todo, { search: 'inbox' }), true);
    assert.equal(taskHiddenByFilters(todo, { search: 'email' }), false);
    assert.equal(taskHiddenByFilters(todo, { search: 'kirim' }), false);
  });

  it('hides a task that does not need confirmation when that filter is on', () => {
    assert.equal(taskHiddenByFilters(todo, { needsConfirmationOnly: true }), false);
    assert.equal(taskHiddenByFilters(
      { ...todo, questions: ['Which inbox?'], answered_questions: [0] },
      { needsConfirmationOnly: true },
    ), true);
  });
});

describe('taskShareHref', () => {
  it('keeps the scope and adds a task id the board can reopen', () => {
    assert.equal(taskShareHref('created', 'task-1'), '/dashboard?scope=created&task=task-1');
    assert.equal(taskShareHref(null, 'a b'), '/dashboard?task=a+b');
  });
});
