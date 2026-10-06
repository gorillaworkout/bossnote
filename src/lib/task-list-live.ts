export const TASK_EVENTS_PATH = '/api/tasks/events';
export const TASK_EVENTS_RETRY_MS = 3000;

export function createCoalescedRefresh(refresh: () => void, waitMs: number): {
  kick: () => void;
  stop: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    kick() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        refresh();
      }, waitMs);
    },
    stop() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

/** Keep a status click that has not finished saving when a live refetch lands. */
export function mergeLiveTaskList<T extends { id: string; status: string }>(
  incoming: T[],
  previous: T[],
  pendingId: string | null,
): T[] {
  if (!pendingId) return incoming;
  const optimistic = previous.find((task) => task.id === pendingId);
  if (!optimistic) return incoming;
  return incoming.map((task) => (
    task.id === pendingId ? { ...task, status: optimistic.status } : task
  ));
}
