/** Bosses see every task. Members see only their own tasks with a boss in their department. */

export type Viewer = { id: string; role: string; department_id?: string | null };

export type TaskParties = {
  assignee_id: string;
  created_by: string;
  creator_role: string;
  creator_department_id: string | null;
  assignee_role: string;
  assignee_department_id: string | null;
};

export const TASK_PARTY_SELECT = `
JOIN users bu ON t.created_by = bu.id
JOIN users au ON t.assignee_id = au.id
`;

export function canViewTask(viewer: Viewer, task: TaskParties): boolean {
  if (viewer.role === 'boss') return true;
  if (viewer.role !== 'member' || !viewer.department_id) return false;
  const assignedByBoss =
    viewer.id === task.assignee_id &&
    viewer.id !== task.created_by &&
    task.creator_role === 'boss' &&
    task.creator_department_id === viewer.department_id;
  const createdForBoss =
    viewer.id === task.created_by &&
    viewer.id !== task.assignee_id &&
    task.assignee_role === 'boss' &&
    task.assignee_department_id === viewer.department_id;
  return assignedByBoss || createdForBoss;
}

/** Lock-screen tap opens the task (and its screenshot) on the board. */
export function assignmentPushUrl(taskId: string): string {
  const id = (taskId || '').trim();
  if (!id) return '/dashboard';
  return `/dashboard?task=${encodeURIComponent(id)}`;
}
