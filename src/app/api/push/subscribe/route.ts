import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { removeSubscription, saveSubscription } from '@/lib/push';

export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  } | null;

  const ok = await saveSubscription(
    user.id,
    { endpoint: body?.endpoint || '', keys: body?.keys },
    request.headers.get('user-agent'),
  );
  if (!ok) return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null) as { endpoint?: string } | null;
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint.trim() : '';
  if (!endpoint) return NextResponse.json({ error: 'endpoint is required' }, { status: 400 });

  await removeSubscription(endpoint);
  return NextResponse.json({ ok: true });
}
