/** Live task-list fan-out. Web Push stays for lock-screen alerts; an open tab uses this stream. */

export const TASK_STREAM_PATH = '/api/tasks/stream';
export const TASK_STREAM_RETRY_MS = 2000;
export const TASK_STREAM_HEARTBEAT_MS = 15000;
/** Backup while a tab is open. SSE is the fast path; this covers a missed event. */
export const TASK_LIST_POLL_MS = 15000;

export const TASK_LIST_CHANNEL = 'bossnote_tasks';

export type TaskListChange = {
  id: string;
  assignee_id: string;
  created_by: string;
  previous_assignee_id: string | null;
};

export function taskChangeRelevant(
  user: { id: string; role: string },
  change: Pick<TaskListChange, 'assignee_id' | 'created_by' | 'previous_assignee_id'>,
): boolean {
  if (user.role === 'boss') return true;
  return user.id === change.assignee_id
    || user.id === change.created_by
    || (change.previous_assignee_id != null && user.id === change.previous_assignee_id);
}

export function parseTaskListChange(payload: string): TaskListChange | null {
  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id : '';
  const assigneeId = typeof row.assignee_id === 'string' ? row.assignee_id : '';
  const createdBy = typeof row.created_by === 'string' ? row.created_by : '';
  const previous = row.previous_assignee_id;
  const previousAssigneeId = typeof previous === 'string' && previous ? previous : null;
  if (!id || !assigneeId || !createdBy) return null;
  return {
    id,
    assignee_id: assigneeId,
    created_by: createdBy,
    previous_assignee_id: previousAssigneeId,
  };
}

export function formatTaskStreamHello(): string {
  return `retry: ${TASK_STREAM_RETRY_MS}\n\n: connected\n\n`;
}

export function formatTaskStreamEvent(change: { id: string }): string {
  return `event: tasks\ndata: ${JSON.stringify({ id: change.id })}\n\n`;
}

export function formatTaskStreamHeartbeat(): string {
  return ': ping\n\n';
}

/** EventSource.CLOSED is 2. CONNECTING means the browser is already retrying. */
export function shouldManuallyReconnectEventSource(readyState: number): boolean {
  return readyState === 2;
}
