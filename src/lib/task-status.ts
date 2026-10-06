/** Stored task statuses. Labels match the board copy (waiting is shown as Stuck). */
export const TASK_STATUSES = [
  { value: 'todo', label: 'To Do', shortLabel: 'To Do' },
  { value: 'in_progress', label: 'In Progress', shortLabel: 'Progress' },
  { value: 'waiting', label: 'Stuck', shortLabel: 'Stuck' },
  { value: 'done', label: 'Done', shortLabel: 'Done' },
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number]['value'];

export function isTaskStatus(value: string): value is TaskStatus {
  return TASK_STATUSES.some((status) => status.value === value);
}
