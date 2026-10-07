import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { queryAll } from '@/lib/database';
import { candidateListQuery } from '@/lib/assignment';

const DIRECTORY_SQL =
  "SELECT id, name, role FROM users WHERE role IN ('boss', 'member') ORDER BY LOWER(name)";

export async function GET(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const view = new URL(request.url).searchParams.get('view');
  if (view === 'directory') {
    if (user.role !== 'boss') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const users = await queryAll<{ id: string; name: string; role: string }>(DIRECTORY_SQL);
    return NextResponse.json({ users });
  }

  if (user.role === 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const listed = candidateListQuery({ role: user.role, department_id: user.department_id ?? null });
  if (!listed) return NextResponse.json({ users: [] });

  const rows = await queryAll<{ id: string; name: string; role: string }>(listed.sql, listed.values);
  return NextResponse.json({
    users: rows.map((row) => ({ id: row.id, name: row.name, role: row.role })),
  });
}
