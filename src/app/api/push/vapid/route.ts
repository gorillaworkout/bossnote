import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getVapidPublicKey } from '@/lib/push';

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return NextResponse.json({ error: 'Push is not configured' }, { status: 503 });
  }
  return NextResponse.json({ publicKey });
}
