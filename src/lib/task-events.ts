import { EventEmitter } from 'node:events';
import { Client } from 'pg';
import { execute, databaseConnectionString } from '@/lib/database';
import {
  parseTaskListChange,
  TASK_LIST_CHANNEL,
  type TaskListChange,
} from '@/lib/task-live';

type Hub = {
  emitter: EventEmitter;
  client: Client | null;
  connecting: Promise<void> | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
};

const HUB_KEY = '__bossnoteTaskHub';

function hub(): Hub {
  const g = globalThis as typeof globalThis & { [HUB_KEY]?: Hub };
  if (!g[HUB_KEY]) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0);
    g[HUB_KEY] = { emitter, client: null, connecting: null, reconnectTimer: null };
  }
  return g[HUB_KEY];
}

function scheduleReconnect() {
  const state = hub();
  if (state.reconnectTimer || state.connecting) return;
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    void ensureTaskListener();
  }, 1000);
}

function attachClient(client: Client) {
  const state = hub();
  client.on('notification', (msg) => {
    if (msg.channel !== TASK_LIST_CHANNEL || !msg.payload) return;
    const change = parseTaskListChange(msg.payload);
    if (!change) return;
    state.emitter.emit('change', change);
  });
  client.on('error', (err) => {
    console.error('[bossnote] task listen error:', err);
    if (state.client === client) state.client = null;
    void client.end().catch(() => {});
    scheduleReconnect();
  });
  client.on('end', () => {
    if (state.client === client) state.client = null;
    scheduleReconnect();
  });
}

export async function ensureTaskListener(): Promise<void> {
  const state = hub();
  if (state.client) return;
  if (state.connecting) return state.connecting;
  state.connecting = (async () => {
    const client = new Client({ connectionString: databaseConnectionString() });
    attachClient(client);
    try {
      await client.connect();
      await client.query(`LISTEN ${TASK_LIST_CHANNEL}`);
      state.client = client;
    } catch (err) {
      console.error('[bossnote] task listen connect failed:', err);
      try { await client.end(); } catch { /* already closed */ }
    } finally {
      state.connecting = null;
      if (!state.client) scheduleReconnect();
    }
  })();
  return state.connecting;
}

export function subscribeTaskChanges(listener: (change: TaskListChange) => void): () => void {
  const state = hub();
  void ensureTaskListener();
  state.emitter.on('change', listener);
  return () => {
    state.emitter.off('change', listener);
  };
}

export async function publishTaskListChange(change: TaskListChange): Promise<void> {
  const payload = JSON.stringify({
    id: change.id,
    assignee_id: change.assignee_id,
    created_by: change.created_by,
    previous_assignee_id: change.previous_assignee_id,
  });
  await execute('SELECT pg_notify(?, ?)', [TASK_LIST_CHANNEL, payload]);
}

/** List refresh must never fail the create or reassign that triggered it. */
export function publishTaskListChangeSafe(change: TaskListChange): void {
  void publishTaskListChange(change).catch((err) => {
    console.error('[bossnote] task list notify failed:', err);
  });
}
