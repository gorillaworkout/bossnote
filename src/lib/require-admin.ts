import { NextResponse } from 'next/server.js';

export function requireAdmin(user: { role: string } | null, message: string) {
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: message }, { status: 403 });
  return null;
}
