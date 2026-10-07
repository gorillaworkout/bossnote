import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { execute, queryOne } from '@/lib/database';
import { DEPARTMENT_IN_USE_ERROR, normalizeDepartmentName } from '@/lib/managed-user';
import { requireAdmin } from '@/lib/require-admin';

const ADMIN_MESSAGE = 'Only an admin can manage departments';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = requireAdmin(await getSession(), ADMIN_MESSAGE);
  if (denied) return denied;

  const { id } = await params;
  const existing = await queryOne('SELECT id FROM departments WHERE id = ?', [id]);
  if (!existing) return NextResponse.json({ error: 'Department not found' }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { name?: unknown };
  const parsed = normalizeDepartmentName(body.name);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const taken = await queryOne(
    'SELECT id FROM departments WHERE LOWER(name) = LOWER(?) AND id <> ?',
    [parsed.name, id],
  );
  if (taken) return NextResponse.json({ error: 'That department name is already taken' }, { status: 409 });

  try {
    await execute('UPDATE departments SET name = ? WHERE id = ?', [parsed.name, id]);
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: 'That department name is already taken' }, { status: 409 });
    }
    throw err;
  }
  const department = await queryOne('SELECT id, name, created_at FROM departments WHERE id = ?', [id]);
  return NextResponse.json({ department });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = requireAdmin(await getSession(), ADMIN_MESSAGE);
  if (denied) return denied;

  const { id } = await params;
  const existing = await queryOne('SELECT id FROM departments WHERE id = ?', [id]);
  if (!existing) return NextResponse.json({ error: 'Department not found' }, { status: 404 });

  const count = await queryOne<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM users WHERE department_id = ?',
    [id],
  );
  if (Number(count?.n) > 0) {
    return NextResponse.json({ error: DEPARTMENT_IN_USE_ERROR }, { status: 409 });
  }

  try {
    await execute('DELETE FROM departments WHERE id = ?', [id]);
  } catch (err) {
    if (isRestrictViolation(err)) {
      return NextResponse.json({ error: DEPARTMENT_IN_USE_ERROR }, { status: 409 });
    }
    throw err;
  }
  return NextResponse.json({ ok: true });
}

function isUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23505');
}

function isRestrictViolation(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23503');
}
