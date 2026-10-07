import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import {
  TASK_EVENTS_PATH,
  TASK_EVENTS_RETRY_MS,
  TASK_LIST_NOTIFY_CHANNEL,
  createCoalescedRefresh,
  createTaskListEventStream,
  handleTaskListNotification,
  mergeLiveTaskList,
  publishTaskListChange,
  resetTaskListBusForTests,
  subscribeTaskListChanges,
  taskListListenerCount,
} from './task-live.ts';

describe('task list live bus', () => {
  it('fans a change out to every open session and then forgets them', () => {
    resetTaskListBusForTests();
    const seen: string[] = [];
    const stopA = subscribeTaskListChanges((event) => seen.push(`a:${event.type}`));
    const stopB = subscribeTaskListChanges((event) => seen.push(`b:${event.type}`));
    assert.equal(taskListListenerCount(), 2);

    const event = publishTaskListChange();
    assert.deepEqual(Object.keys(event).sort(), ['at', 'type']);
    assert.equal(event.type, 'tasks');
    assert.deepEqual(seen, ['a:tasks', 'b:tasks']);

    stopA();
    publishTaskListChange();
    assert.deepEqual(seen, ['a:tasks', 'b:tasks', 'b:tasks']);
    stopB();
    assert.equal(taskListListenerCount(), 0);
  });

  it('keeps delivering when one session handler throws', () => {
    resetTaskListBusForTests();
    const seen: string[] = [];
    const stopA = subscribeTaskListChanges(() => {
      throw new Error('tab crashed');
    });
    const stopB = subscribeTaskListChanges(() => seen.push('ok'));
    publishTaskListChange();
    assert.deepEqual(seen, ['ok']);
    stopA();
    stopB();
  });

  it('treats a postgres NOTIFY as a list refresh with no task body', () => {
    resetTaskListBusForTests();
    const seen: Array<Record<string, unknown>> = [];
    const stop = subscribeTaskListChanges((event) => seen.push({ ...event }));
    handleTaskListNotification('other', '');
    assert.equal(seen.length, 0);
    handleTaskListNotification(TASK_LIST_NOTIFY_CHANNEL, '{"title":"secret"}');
    assert.equal(seen.length, 1);
    assert.equal(seen[0].type, 'tasks');
    assert.equal('title' in seen[0], false);
    stop();
  });
});

describe('task list SSE stream', () => {
  it('tells an open dashboard to refetch when another session changes a task', async () => {
    resetTaskListBusForTests();
    const abort = new AbortController();
    const stream = createTaskListEventStream(abort.signal, { heartbeatMs: 60_000 });
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    const readUntil = async (pattern: RegExp) => {
      let text = '';
      const deadline = Date.now() + 1000;
      while (!pattern.test(text)) {
        if (Date.now() > deadline) throw new Error(`timed out waiting for ${pattern}, got ${JSON.stringify(text)}`);
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }
      return text;
    };

    try {
      const prelude = await readUntil(/event: ready/);
      assert.match(prelude, new RegExp(`retry: ${TASK_EVENTS_RETRY_MS}`));
      assert.match(prelude, /event: ready/);
      assert.match(prelude, / {64,}/);
      assert.equal(taskListListenerCount(), 1);

      publishTaskListChange();
      const update = await readUntil(/event: tasks/);
      assert.match(update, /"type":"tasks"/);
      assert.doesNotMatch(update, /assignee|title|transcript/i);
    } finally {
      abort.abort();
      await reader.cancel().catch(() => {});
    }
    assert.equal(taskListListenerCount(), 0);
  });
});

describe('live list refresh helpers', () => {
  it('uses the task events path', () => {
    assert.equal(TASK_EVENTS_PATH, '/api/tasks/events');
  });

  it('coalesces a burst of events into one refetch', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      let calls = 0;
      const refresher = createCoalescedRefresh(() => { calls += 1; }, 200);
      refresher.kick();
      refresher.kick();
      refresher.kick();
      assert.equal(calls, 0);
      mock.timers.tick(199);
      assert.equal(calls, 0);
      mock.timers.tick(1);
      assert.equal(calls, 1);
      refresher.stop();
    } finally {
      mock.timers.reset();
    }
  });

  it('keeps an in-flight status click when a live refetch arrives', () => {
    const previous = [
      { id: 'a', status: 'in_progress', title: 'Old' },
      { id: 'b', status: 'todo', title: 'Other' },
    ];
    const incoming = [
      { id: 'a', status: 'todo', title: 'New title' },
      { id: 'b', status: 'done', title: 'Other' },
      { id: 'c', status: 'todo', title: 'Assigned just now' },
    ];
    const merged = mergeLiveTaskList(incoming, previous, 'a');
    assert.equal(merged.find((task) => task.id === 'a')?.status, 'in_progress');
    assert.equal(merged.find((task) => task.id === 'a')?.title, 'New title');
    assert.equal(merged.find((task) => task.id === 'b')?.status, 'done');
    assert.equal(merged.find((task) => task.id === 'c')?.title, 'Assigned just now');
    assert.deepEqual(mergeLiveTaskList(incoming, previous, null), incoming);
  });

  it('collapses the same task id if a refetch returns it twice', () => {
    const incoming = [
      { id: 'a', status: 'todo', title: 'Create FM asset request' },
      { id: 'a', status: 'todo', title: 'Create FM asset request' },
    ];
    const merged = mergeLiveTaskList(incoming, [], null);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.id, 'a');
  });
});
