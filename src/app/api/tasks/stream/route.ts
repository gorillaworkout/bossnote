import { getSession } from '@/lib/auth';
import { subscribeTaskChanges } from '@/lib/task-events';
import {
  formatTaskStreamEvent,
  formatTaskStreamHeartbeat,
  formatTaskStreamHello,
  taskChangeRelevant,
  TASK_STREAM_HEARTBEAT_MS,
} from '@/lib/task-live';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const user = await getSession();
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
        unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      };

      send(formatTaskStreamHello());
      unsubscribe = subscribeTaskChanges((change) => {
        if (!taskChangeRelevant(user, change)) return;
        send(formatTaskStreamEvent(change));
      });
      heartbeat = setInterval(() => send(formatTaskStreamHeartbeat()), TASK_STREAM_HEARTBEAT_MS);

      request.signal.addEventListener('abort', cleanup);
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
