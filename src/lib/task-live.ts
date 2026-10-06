import type { Client } from 'pg';
import { TASK_EVENTS_RETRY_MS } from './task-list-live.ts';

export { TASK_EVENTS_PATH, TASK_EVENTS_RETRY_MS, createCoalescedRefresh, mergeLiveTaskList } from './task-list-live.ts';

export const TASK_EVENTS_HEARTBEAT_MS = 15_000;
export const TASK_LIST_NOTIFY_CHANNEL = 'bossnote_tasks';

export type TaskListLiveEvent = {
  type: 'tasks';
  at: number;
};

type Listener = (event: TaskListLiveEvent) => void;

type Bus = {
  listeners: Set<Listener>;
  listenerStarted: boolean;
};

const BUS_KEY = '__bossnoteTaskListBus';

function bus(): Bus {
  const g = globalThis as typeof globalThis & { [BUS_KEY]?: Bus };
  if (!g[BUS_KEY]) {
    g[BUS_KEY] = { listeners: new Set(), listenerStarted: false };
  }
  return g[BUS_KEY];
}

function emitLocal(event?: TaskListLiveEvent): TaskListLiveEvent {
  const next: TaskListLiveEvent = event?.type === 'tasks'
    ? { type: 'tasks', at: event.at }
    : { type: 'tasks', at: Date.now() };
  for (const listener of bus().listeners) {
    try {
      listener(next);
    } catch (err) {
      console.error('[bossnote] task list listener failed', err);
    }
  }
  return next;
}

/** Wake every open dashboard in this process, then other Node processes via Postgres. */
export function publishTaskListChange(): TaskListLiveEvent {
  const event = emitLocal({ type: 'tasks', at: Date.now() });
  void notifyTaskListChannel();
  return event;
}

export function subscribeTaskListChanges(listener: Listener): () => void {
  const listeners = bus().listeners;
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function taskListListenerCount(): number {
  return bus().listeners.size;
}

export function resetTaskListBusForTests(): void {
  bus().listeners.clear();
}

/** LISTEN payload is ignored so a notify can never carry task content. */
export function handleTaskListNotification(channel: string, payload?: string): void {
  if (channel !== TASK_LIST_NOTIFY_CHANNEL) return;
  void payload;
  emitLocal();
}

async function notifyTaskListChannel(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    const { getDb } = await import('@/lib/database');
    await getDb().query('SELECT pg_notify($1, $2)', [TASK_LIST_NOTIFY_CHANNEL, '']);
  } catch (err) {
    console.error('[bossnote] task list notify failed', err);
  }
}

/**
 * One LISTEN connection per process. Publish still updates this process immediately,
 * and NOTIFY covers a second Node process sharing DATABASE_URL.
 */
export function ensureTaskListDbListener(): void {
  if (bus().listenerStarted || !process.env.DATABASE_URL) return;
  bus().listenerStarted = true;
  void connectTaskListListener();
}

async function connectTaskListListener(): Promise<void> {
  const { Client } = await import('pg');
  const client: Client = new Client({ connectionString: process.env.DATABASE_URL });
  let stopped = false;

  const restart = (err: unknown) => {
    if (stopped) return;
    stopped = true;
    console.error('[bossnote] task list listen dropped', err);
    bus().listenerStarted = false;
    client.removeAllListeners();
    void client.end().catch(() => {});
    const retry = setTimeout(() => ensureTaskListDbListener(), 2000);
    retry.unref?.();
  };

  client.on('error', restart);
  client.on('end', () => {
    if (!stopped) restart(new Error('listen connection ended'));
  });
  client.on('notification', (msg) => {
    handleTaskListNotification(msg.channel, msg.payload);
  });

  try {
    await client.connect();
    await client.query(`LISTEN ${TASK_LIST_NOTIFY_CHANNEL}`);
  } catch (err) {
    restart(err);
  }
}

function taskListSsePrelude(): string {
  return [
    `retry: ${TASK_EVENTS_RETRY_MS}`,
    '',
    'event: ready',
    'data: {"type":"ready"}',
    '',
    `: ${' '.repeat(2048)}`,
    '',
    '',
  ].join('\n');
}

function formatTaskListSse(event: TaskListLiveEvent): string {
  return `event: tasks\ndata: ${JSON.stringify({ type: event.type, at: event.at })}\n\n`;
}

export function createTaskListEventStream(
  signal: AbortSignal,
  options?: { heartbeatMs?: number },
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const heartbeatMs = options?.heartbeatMs ?? TASK_EVENTS_HEARTBEAT_MS;
  let closed = false;
  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const close = () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    unsubscribe();
  };

  return new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          close();
        }
      };

      send(taskListSsePrelude());
      unsubscribe = subscribeTaskListChanges((event) => {
        send(formatTaskListSse(event));
      });

      heartbeat = setInterval(() => {
        send(`: ping ${Date.now()}\n\n`);
      }, heartbeatMs);
      heartbeat.unref?.();

      const onAbort = () => {
        close();
        try { controller.close(); } catch { /* already closed */ }
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    },
    cancel() {
      close();
    },
  });
}

