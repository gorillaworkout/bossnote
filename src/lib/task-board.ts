import { needsConfirmation, type QuestionTask } from './needs-confirmation.ts';
import { TASK_STATUSES } from './task-status.ts';

/** First occurrence wins so a refetch cannot paint the same task twice. */
export function dedupeTasksById<T extends { id: string }>(tasks: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const task of tasks) {
    if (!task.id || seen.has(task.id)) continue;
    seen.add(task.id);
    unique.push(task);
  }
  return unique;
}

/** One selected status chip focuses that column. All (or an unknown value) keeps the full board. */
export function boardColumns(filterStatus: string) {
  if (!filterStatus) return TASK_STATUSES;
  const match = TASK_STATUSES.filter((status) => status.value === filterStatus);
  return match.length > 0 ? match : TASK_STATUSES;
}

export type BoardFilterTask = QuestionTask & {
  status: string;
  title?: string | null;
  title_id?: string | null;
};

/** True when the open task is outside the status, search, or confirmation filter. */
export function taskHiddenByFilters(
  task: BoardFilterTask,
  filters: { status?: string; search?: string; needsConfirmationOnly?: boolean },
): boolean {
  const status = (filters.status || '').trim();
  if (status && task.status !== status) return true;
  if (filters.needsConfirmationOnly && !needsConfirmation(task)) return true;
  const search = (filters.search || '').trim().toLowerCase();
  if (search) {
    const hay = `${task.title || ''}\n${task.title_id || ''}`.toLowerCase();
    if (!hay.includes(search)) return true;
  }
  return false;
}

/** Shareable board URL. Scope stays in the query so a pasted link reopens the same list. */
export function taskShareHref(scope: string | null | undefined, taskId: string): string {
  const params = new URLSearchParams();
  if (scope) params.set('scope', scope);
  params.set('task', taskId);
  return `/dashboard?${params.toString()}`;
}
