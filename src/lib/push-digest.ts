export const OPEN_TASK_STATUSES = ['todo', 'in_progress', 'waiting'] as const;

export type DigestTask = {
  assignee_id: string;
  title: string;
  title_id?: string | null;
};

export type DigestPayload = {
  title: string;
  body: string;
  url: string;
};

export function groupOpenTasksByAssignee(tasks: DigestTask[]): Map<string, DigestTask[]> {
  const groups = new Map<string, DigestTask[]>();
  for (const task of tasks) {
    if (!task.assignee_id) continue;
    const list = groups.get(task.assignee_id);
    if (list) list.push(task);
    else groups.set(task.assignee_id, [task]);
  }
  return groups;
}

/** Indonesian-friendly daily digest. Returns null when there is nothing to send. */
export function buildDigestPayload(tasks: DigestTask[]): DigestPayload | null {
  if (!tasks.length) return null;

  const titles = tasks
    .map((task) => (task.title_id || task.title || '').trim())
    .filter(Boolean);
  const top = titles.slice(0, 3);
  const extra = titles.length > 3 ? ` (+${titles.length - 3} lagi)` : '';
  const count = tasks.length;
  const title = count === 1 ? '1 tugas terbuka' : `${count} tugas terbuka`;
  const body = top.length > 0
    ? `Kamu punya ${count} tugas: ${top.join(' · ')}${extra}`
    : `Kamu punya ${count} tugas yang masih terbuka.`;

  return { title, body, url: '/dashboard' };
}
