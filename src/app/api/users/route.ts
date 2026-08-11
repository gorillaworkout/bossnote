import { NextResponse } from 'next/server';
import { getSession, getUsers } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const users = await getUsers();
  return NextResponse.json({ users });
}
