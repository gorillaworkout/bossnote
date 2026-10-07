import {
  ASSIGNEE_REQUIRED_CODE,
  ASSIGNEE_REQUIRED_ERROR,
  resolveAssigneeFromHint,
} from './assignee.ts';

export type Party = {
  id: string;
  name: string;
  role: string;
  department_id: string | null;
  email?: string | null;
  lark_open_id?: string | null;
};

export const ASSIGNEE_NOT_ALLOWED_CODE = 'assignee_not_allowed';
export const ASSIGNEE_NOT_ALLOWED_ERROR = 'That assignee is not allowed.';
export const NO_ASSIGNEE_AVAILABLE_CODE = 'no_assignee_available';

export const NO_DEPARTMENT_CREATE_ERROR =
  'An admin must assign your department before you can create tasks.';

export function noAssigneeAvailableMessage(role: string, departmentId?: string | null): string {
  if (role === 'member' && departmentId === null) return NO_DEPARTMENT_CREATE_ERROR;
  if (role === 'member') return 'No boss in your department can take this task.';
  return 'No staff in your department to assign.';
}

export function oppositeRole(role: string): 'boss' | 'member' | null {
  if (role === 'boss') return 'member';
  if (role === 'member') return 'boss';
  return null;
}

export function isValidAssignmentPair(creator: Party, assignee: Party): boolean {
  if (!creator.id || creator.id === assignee.id) return false;
  if (creator.role === 'admin' || assignee.role === 'admin') return false;
  if (!creator.department_id || creator.department_id !== assignee.department_id) return false;
  const roles = [creator.role, assignee.role].slice().sort().join(',');
  return roles === 'boss,member';
}

export function candidatesFor(
  creator: { role: string; department_id: string | null },
  people: Party[],
): Party[] {
  const role = oppositeRole(creator.role);
  if (!role || !creator.department_id) return [];
  return people.filter((person) => person.role === role && person.department_id === creator.department_id);
}

export function candidateListQuery(party: { role: string; department_id: string | null }): { sql: string; values: string[] } | null {
  const role = oppositeRole(party.role);
  if (!role || !party.department_id) return null;
  return {
    sql: 'SELECT id, name, role, email, lark_open_id FROM users WHERE role = ? AND department_id = ? ORDER BY LOWER(name)',
    values: [role, party.department_id],
  };
}

export function decideCreateAssignee(input: {
  creatorRole: string;
  creatorDepartmentId?: string | null;
  candidates: Party[];
  knownUserIds: string[];
  formAssigneeId: string;
  hint: string | null;
  typed: boolean;
}): { ok: true; user: Party } | { ok: false; status: 400; error: string; code?: string } {
  if (input.candidates.length === 0) {
    return {
      ok: false,
      status: 400,
      code: NO_ASSIGNEE_AVAILABLE_CODE,
      error: noAssigneeAvailableMessage(input.creatorRole, input.creatorDepartmentId),
    };
  }
  const formId = input.formAssigneeId.trim();
  if (formId) {
    const chosen = input.candidates.find((person) => person.id === formId);
    if (chosen) return { ok: true, user: chosen };
    if (!input.knownUserIds.includes(formId)) return { ok: false, status: 400, error: 'Assignee not found' };
    return { ok: false, status: 400, code: ASSIGNEE_NOT_ALLOWED_CODE, error: ASSIGNEE_NOT_ALLOWED_ERROR };
  }
  if (input.typed) return { ok: false, status: 400, error: 'Assignee is required' };
  const hinted = resolveAssigneeFromHint(input.hint, input.candidates);
  if (!hinted) return { ok: false, status: 400, code: ASSIGNEE_REQUIRED_CODE, error: ASSIGNEE_REQUIRED_ERROR };
  const user = input.candidates.find((person) => person.id === hinted.id);
  if (!user) return { ok: false, status: 400, code: ASSIGNEE_REQUIRED_CODE, error: ASSIGNEE_REQUIRED_ERROR };
  return { ok: true, user };
}

export function canReassign(
  viewer: { id: string; role: string },
  task: { created_by: string; assignee_id: string },
  canView: boolean,
): boolean {
  if (!canView || viewer.role === 'admin') return false;
  return viewer.role === 'boss' || viewer.id === task.assignee_id || viewer.id === task.created_by;
}

export function decideReassign(input: {
  viewer: { id: string; role: string };
  creator: Party;
  nextAssignee: Party | null;
  task: { created_by: string; assignee_id: string };
  canView: boolean;
}): { ok: true } | { ok: false; status: 400 | 403; error: string; code?: string } {
  if (!canReassign(input.viewer, input.task, input.canView)) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }
  if (!input.nextAssignee) return { ok: false, status: 400, error: 'Assignee not found' };
  if (!isValidAssignmentPair(input.creator, input.nextAssignee)) {
    return { ok: false, status: 400, code: ASSIGNEE_NOT_ALLOWED_CODE, error: ASSIGNEE_NOT_ALLOWED_ERROR };
  }
  return { ok: true };
}
