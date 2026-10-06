import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createTaskListEventStream, ensureTaskListDbListener } from '@/lib/task-live';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  ensureTaskListDbListener();

  return new Response(createTaskListEventStream(request.signal), {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
