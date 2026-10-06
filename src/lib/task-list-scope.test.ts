import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TASK_LIST_SCOPE_STORAGE_KEY,
  buildTaskListQuery,
  defaultTaskListScope,
  emptyTaskScopeMessage,
  resolveTaskListScope,
  taskListScopeLabel,
} from './task-list-scope.ts';

const bayu = { id: 'bayu-001', role: 'member' };
const boss = { id: 'boss-001', role: 'boss' };

describe('default task list scope', () => {
  it('keeps bosses on tasks assigned to them', () => {
    assert.equal(defaultTaskListScope(boss), 'assigned');
    assert.equal(defaultTaskListScope(null), 'assigned');
  });

  it('opens creators on tasks they created', () => {
    assert.equal(defaultTaskListScope(bayu), 'created');
  });
});

describe('resolveTaskListScope', () => {
  it('prefers the URL, then localStorage, then the role default', () => {
    assert.equal(resolveTaskListScope('all', 'created', bayu), 'all');
    assert.equal(resolveTaskListScope('nope', 'assigned', bayu), 'assigned');
    assert.equal(resolveTaskListScope(null, null, bayu), 'created');
    assert.equal(resolveTaskListScope('', '', boss), 'assigned');
    assert.equal(TASK_LIST_SCOPE_STORAGE_KEY, 'bossnote.taskListScope');
  });
});

describe('task list scope labels and empty copy', () => {
  it('uses the dashboard labels and names the active filter when empty', () => {
    assert.equal(taskListScopeLabel('assigned'), 'Assigned to me');
    assert.equal(taskListScopeLabel('created'), 'Created by me');
    assert.equal(taskListScopeLabel('all'), 'All');
    assert.equal(emptyTaskScopeMessage('created'), 'No tasks created by you');
    assert.equal(emptyTaskScopeMessage('assigned'), 'No tasks assigned to you');
    assert.equal(emptyTaskScopeMessage('all'), 'No tasks');
  });
});

describe('buildTaskListQuery', () => {
  it('scopes a member to tasks assigned to them', () => {
    const query = buildTaskListQuery({ user: bayu, scope: 'assigned' });
    assert.match(query.sql, /t\.assignee_id = \?/);
    assert.doesNotMatch(query.sql, /t\.created_by = \?/);
    assert.deepEqual(query.values, ['bayu-001']);
  });

  it('scopes a member to tasks they created', () => {
    const query = buildTaskListQuery({ user: bayu, scope: 'created' });
    assert.match(query.sql, /t\.created_by = \?/);
    assert.doesNotMatch(query.sql, /t\.assignee_id = \?/);
    assert.deepEqual(query.values, ['bayu-001']);
  });

  it('lets a member see the union of assigned and created tasks without other people', () => {
    const query = buildTaskListQuery({ user: bayu, scope: 'all', assignee: 'boss-001' });
    assert.match(query.sql, /\(t\.assignee_id = \? OR t\.created_by = \?\)/);
    assert.deepEqual(query.values, ['bayu-001', 'bayu-001']);
    assert.doesNotMatch(query.sql, /boss-001/);
  });

  it('keeps a member on assigned tasks when scope is missing or unknown', () => {
    for (const scope of [null, undefined, '', 'everything']) {
      const query = buildTaskListQuery({ user: bayu, scope });
      assert.match(query.sql, /t\.assignee_id = \?/);
      assert.doesNotMatch(query.sql, /t\.created_by = \?/);
      assert.deepEqual(query.values, ['bayu-001']);
    }
  });

  it('lets a boss list everything unless scope says assigned or created', () => {
    const omitted = buildTaskListQuery({ user: boss, scope: null });
    assert.doesNotMatch(omitted.sql, /au\.id\s+WHERE/);
    assert.deepEqual(omitted.values, []);

    const assigned = buildTaskListQuery({ user: boss, scope: 'assigned' });
    assert.match(assigned.sql, /t\.assignee_id = \?/);
    assert.deepEqual(assigned.values, ['boss-001']);

    const created = buildTaskListQuery({ user: boss, scope: 'created' });
    assert.match(created.sql, /t\.created_by = \?/);
    assert.deepEqual(created.values, ['boss-001']);

    const all = buildTaskListQuery({ user: boss, scope: 'all' });
    assert.doesNotMatch(all.sql, /au\.id\s+WHERE/);
    assert.deepEqual(all.values, []);
  });

  it('lets a boss narrow All by assignee, status, and search', () => {
    const query = buildTaskListQuery({
      user: boss,
      scope: 'all',
      assignee: 'bayu-001',
      status: 'todo',
      search: 'Deck',
    });
    assert.match(query.sql, /t\.assignee_id = \?/);
    assert.match(query.sql, /t\.status = \?/);
    assert.match(query.sql, /LOWER\(t\.title\) LIKE \?/);
    assert.deepEqual(query.values, ['bayu-001', 'todo', '%deck%', '%deck%']);
  });

  it('keeps Assigned to me even if a boss also passes another assignee', () => {
    const query = buildTaskListQuery({
      user: boss,
      scope: 'assigned',
      assignee: 'bayu-001',
    });
    assert.match(query.sql, /t\.assignee_id = \?/);
    assert.deepEqual(query.values, ['boss-001']);
  });

  it('still orders newest first and caps the page', () => {
    const query = buildTaskListQuery({ user: bayu, scope: 'created', status: 'waiting' });
    assert.match(query.sql, /ORDER BY t\.created_at DESC LIMIT 100/);
    assert.match(query.sql, /task_replies/);
    assert.deepEqual(query.values, ['bayu-001', 'waiting']);
  });
});
