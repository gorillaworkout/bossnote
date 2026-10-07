import { normalizeLarkOpenId } from './lark.ts';
import { ADMIN_USER_ID } from './roles.ts';

export const DEPARTMENT_IN_USE_ERROR =
  'Move the people in this department to another department before deleting it.';

export function normalizeDepartmentName(raw: unknown): { ok: true; name: string } | { ok: false; error: string } {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!name) return { ok: false, error: 'Name is required' };
  if (name.length > 60) return { ok: false, error: 'Name is too long' };
  return { ok: true, name };
}

export function validateCreateUser(body: {
  name?: unknown;
  password?: unknown;
  role?: unknown;
  department_id?: unknown;
}):
  | { ok: true; name: string; password: string; role: 'boss' | 'member'; department_id: string }
  | { ok: false; status: 400; error: string } {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return { ok: false, status: 400, error: 'Name is required' };
  if (name.length > 60) return { ok: false, status: 400, error: 'Name is too long' };
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 6) return { ok: false, status: 400, error: 'Password must be at least 6 characters' };
  if (body.role !== 'boss' && body.role !== 'member') {
    return { ok: false, status: 400, error: 'Role must be Boss or Staff' };
  }
  const departmentId = typeof body.department_id === 'string' ? body.department_id.trim() : '';
  if (!departmentId) return { ok: false, status: 400, error: 'Department is required' };
  return { ok: true, name, password, role: body.role, department_id: departmentId };
}

export function validateUpdateUser(input: {
  actorId: string;
  target: { id: string; name: string; role: string; department_id: string | null };
  body: { name?: unknown; role?: unknown; department_id?: unknown; lark_open_id?: unknown };
}):
  | { ok: true; name: string; role: 'boss' | 'member' | null; department_id: string | null; lark_open_id: string | null | undefined }
  | { ok: false; status: 400; error: string } {
  const name = typeof input.body.name === 'string' ? input.body.name.trim() : input.target.name;
  if (!name) return { ok: false, status: 400, error: 'Name is required' };
  if (name.length > 60) return { ok: false, status: 400, error: 'Name is too long' };

  const roleSent = input.body.role !== undefined;
  const departmentSent = input.body.department_id !== undefined;
  const nextRole = input.body.role === 'boss' || input.body.role === 'member' ? input.body.role : null;
  const nextDepartment = typeof input.body.department_id === 'string' ? input.body.department_id.trim() : '';

  if (input.target.role === 'admin' || input.target.id === ADMIN_USER_ID) {
    if (roleSent && input.body.role !== 'admin') {
      return { ok: false, status: 400, error: 'The admin role cannot be changed' };
    }
    if (departmentSent && nextDepartment) {
      return { ok: false, status: 400, error: 'The admin account cannot belong to a department' };
    }
    return {
      ok: true,
      name,
      role: null,
      department_id: null,
      lark_open_id: larkField(input.body.lark_open_id),
    };
  }

  if (roleSent && !nextRole) return { ok: false, status: 400, error: 'Role must be Boss or Staff' };

  const currentRole = input.target.role === 'boss' || input.target.role === 'member' ? input.target.role : null;
  const resultingRole = nextRole ?? currentRole;
  const resultingDepartment = departmentSent ? (nextDepartment || null) : input.target.department_id;
  if (resultingRole === 'boss' && !resultingDepartment) {
    return { ok: false, status: 400, error: 'A boss account needs a department.' };
  }

  return {
    ok: true,
    name,
    role: nextRole,
    department_id: resultingDepartment,
    lark_open_id: larkField(input.body.lark_open_id),
  };
}

export function resolveLarkOpenIdChange(input: {
  role: string;
  authProvider: string;
  stored: string | null;
  incoming: string | null | undefined;
}): { ok: true; next: string | null } | { ok: false; status: 400; error: string } {
  if (input.incoming === undefined) return { ok: true, next: input.stored };
  const trimmed = input.incoming === null ? '' : input.incoming.trim();
  if (trimmed === (input.stored ?? '')) return { ok: true, next: input.stored };

  if (input.role === 'admin') {
    if (!trimmed) return { ok: true, next: null };
    return { ok: false, status: 400, error: 'The admin account cannot use Lark sign-in.' };
  }
  if (input.authProvider === 'lark') {
    return { ok: false, status: 400, error: 'Lark sign-in id cannot be changed.' };
  }
  if (!trimmed) return { ok: true, next: null };
  const normalized = normalizeLarkOpenId(trimmed);
  if (!normalized) return { ok: false, status: 400, error: 'Lark Open ID looks invalid' };
  return { ok: true, next: normalized };
}

function larkField(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === 'string' ? value.trim() : '';
}

export function deleteUserBlock(input: {
  actorId: string;
  targetId: string;
  taskCount: number;
  replyCount: number;
}): { status: number; error: string } | null {
  if (input.targetId === input.actorId) return { status: 400, error: 'You cannot delete yourself' };
  if (input.targetId === ADMIN_USER_ID) return { status: 400, error: 'The admin account cannot be deleted.' };
  const total = input.taskCount + input.replyCount;
  if (total > 0) {
    return {
      status: 409,
      error: `This user still has ${total} task(s)/reply(s). Reassign or delete them first.`,
    };
  }
  return null;
}
