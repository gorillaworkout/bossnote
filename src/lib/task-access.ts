/** Bosses see every task. Members see tasks assigned to them or that they created. */
export function canViewTask(
  user: { id: string; role: string },
  task: { assignee_id: string; created_by: string },
): boolean {
  if (user.role === 'boss') return true;
  return user.id === task.assignee_id || user.id === task.created_by;
}

/** Lock-screen tap opens the task (and its screenshot) on the board. */
export function assignmentPushUrl(taskId: string): string {
  const id = (taskId || '').trim();
  if (!id) return '/dashboard';
  return `/dashboard?task=${encodeURIComponent(id)}`;
}
