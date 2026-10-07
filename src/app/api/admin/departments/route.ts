import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getSession } from '@/lib/auth';
import { execute, queryAll, queryOne } from '@/lib/database';
import { normalizeDepartmentName } from '@/lib/managed-user';
import { requireAdmin } from '@/lib/require-admin';

const ADMIN_MESSAGE = 'Only an admin can manage departments';

export async function GET() {
  const denied = requireAdmin(await getSession(), ADMIN_MESSAGE);
  if (denied) return denied;

  const rows = await queryAll<{
    id: string;
    name: string;
    created_at: string;
    boss_count: number;
    member_count: number;
  }>(
    `SELECT d.id, d.name, d.created_at,
      COUNT(*) FILTER (WHERE u.role = 'boss')::int AS boss_count,
      COUNT(*) FILTER (WHERE u.role = 'member')::int AS member_count
    FROM departments d
    LEFT JOIN users u ON u.department_id = d.id
    GROUP BY d.id, d.name, d.created_at
    ORDER BY LOWER(d.name)`,
  );
  const departments = rows.map((row) => ({
    ...row,
    boss_count: Number(row.boss_count),
    member_count: Number(row.member_count),
  }));
  return NextResponse.json({ departments });
}

export async function POST(request: NextRequest) {
  const denied = requireAdmin(await getSession(), ADMIN_MESSAGE);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as { name?: unknown };
  const parsed = normalizeDepartmentName(body.name);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const taken = await queryOne('SELECT id FROM departments WHERE LOWER(name) = LOWER(?)', [parsed.name]);
  if (taken) return NextResponse.json({ error: 'That department name is already taken' }, { status: 409 });

  const id = uuidv4();
  try {
    await execute('INSERT INTO departments (id, name) VALUES (?, ?)', [id, parsed.name]);
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: 'That department name is already taken' }, { status: 409 });
    }
    throw err;
  }
  const department = await queryOne('SELECT id, name, created_at FROM departments WHERE id = ?', [id]);
  return NextResponse.json({ department }, { status: 201 });
}

function isUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23505');
}
