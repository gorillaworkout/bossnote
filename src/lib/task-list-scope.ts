export const TASK_LIST_SCOPES = ['assigned', 'created', 'all'] as const;
export type TaskListScope = (typeof TASK_LIST_SCOPES)[number];

export const TASK_LIST_SCOPE_STORAGE_KEY = 'bossnote.taskListScope';

const LIST_SELECT = `
    SELECT t.*,
      bu.name as boss_name,
      au.name as assignee_name,
      ad.name AS assignee_department_name,
      (SELECT COUNT(*) FROM task_replies WHERE task_id = t.id) as reply_count
    FROM tasks t
    JOIN users bu ON t.created_by = bu.id
    JOIN users au ON t.assignee_id = au.id
    LEFT JOIN departments ad ON ad.id = au.department_id
  `;

export function isTaskListScope(value: string | null | undefined): value is TaskListScope {
  return value === 'assigned' || value === 'created' || value === 'all';
}

/** Bosses land on their assignments. Creators land on tasks they uploaded. */
export function defaultTaskListScope(
  user: { role: string } | null | undefined,
): TaskListScope {
  if (!user || user.role === 'boss') return 'assigned';
  return 'created';
}

/** URL wins, then the last choice stored in the browser, then the role default. */
export function resolveTaskListScope(
  urlScope: string | null | undefined,
  storedScope: string | null | undefined,
  user: { role: string } | null | undefined,
): TaskListScope {
  if (isTaskListScope(urlScope)) return urlScope;
  if (isTaskListScope(storedScope)) return storedScope;
  return defaultTaskListScope(user);
}

export function taskListScopeLabel(scope: TaskListScope): string {
  if (scope === 'assigned') return 'Assigned to me';
  if (scope === 'created') return 'Created by me';
  return 'All';
}

export function emptyTaskScopeMessage(scope: TaskListScope): string {
  if (scope === 'created') return 'No tasks created by you';
  if (scope === 'assigned') return 'No tasks assigned to you';
  return 'No tasks';
}

export function buildTaskListQuery(input: {
  user: { id: string; role: string; department_id?: string | null };
  scope?: string | null;
  assignee?: string | null;
  status?: string | null;
  search?: string | null;
}): { sql: string; values: string[] } {
  const scope = isTaskListScope(input.scope) ? input.scope : null;
  const conditions: string[] = [];
  const values: string[] = [];
  const isBoss = input.user.role === 'boss';
  const departmentId = input.user.department_id ?? null;

  if (input.user.role === 'admin' || (!isBoss && !departmentId)) {
    conditions.push('FALSE');
  } else if (!isBoss) {
    const memberScope = scope ?? 'assigned';
    if (memberScope === 'assigned') {
      conditions.push("t.assignee_id = ? AND t.created_by <> ? AND bu.role = 'boss' AND bu.department_id = ?");
      values.push(input.user.id, input.user.id, departmentId);
    } else if (memberScope === 'created') {
      conditions.push("t.created_by = ? AND t.assignee_id <> ? AND au.role = 'boss' AND au.department_id = ?");
      values.push(input.user.id, input.user.id, departmentId);
    } else {
      conditions.push(
        "(t.assignee_id = ? AND t.created_by <> ? AND bu.role = 'boss' AND bu.department_id = ?) OR (t.created_by = ? AND t.assignee_id <> ? AND au.role = 'boss' AND au.department_id = ?)",
      );
      values.push(
        input.user.id,
        input.user.id,
        departmentId,
        input.user.id,
        input.user.id,
        departmentId,
      );
    }
  } else if (scope === 'assigned') {
    conditions.push('t.assignee_id = ?');
    values.push(input.user.id);
  } else if (scope === 'created') {
    conditions.push('t.created_by = ?');
    values.push(input.user.id);
  } else if (input.assignee) {
    conditions.push('t.assignee_id = ?');
    values.push(input.assignee);
  }

  if (input.status) {
    conditions.push('t.status = ?');
    values.push(input.status);
  }

  const search = input.search?.trim();
  if (search) {
    conditions.push('(LOWER(t.title) LIKE ? OR LOWER(t.title_id) LIKE ?)');
    const needle = `%${search.toLowerCase()}%`;
    values.push(needle, needle);
  }

  let sql = LIST_SELECT;
  if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY t.created_at DESC LIMIT 100';
  return { sql, values };
}
