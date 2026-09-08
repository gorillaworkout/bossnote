import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { sendPushToUser } from '@/lib/push';

export async function POST() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await sendPushToUser(user.id, {
    title: 'BossNote',
    body: 'Notifikasi tes — kalau ini muncul di HP, push sudah aktif.',
    url: '/dashboard',
  });

  return NextResponse.json({ ok: true, ...result });
}
