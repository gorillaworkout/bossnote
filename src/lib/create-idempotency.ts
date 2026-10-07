const TTL_MS = 10 * 60 * 1000;

type Entry = { taskId: string | null; at: number };

const claims = new Map<string, Entry>();

function claimKey(userId: string, token: string): string {
  return `${userId}:${token}`;
}

export function resetCreateClaimsForTests(): void {
  claims.clear();
}

export type CreateClaim =
  | { status: 'skip' }
  | { status: 'fresh' }
  | { status: 'in_flight' }
  | { status: 'replay'; taskId: string };

/**
 * One browser submission (including the assignee / keep-draft retry) shares a token.
 * A second in-flight request must not insert another row.
 */
export function beginCreateClaim(userId: string, token: string, now = Date.now()): CreateClaim {
  if (!token) return { status: 'skip' };
  const key = claimKey(userId, token);
  const hit = claims.get(key);
  if (hit && now - hit.at < TTL_MS) {
    if (hit.taskId) return { status: 'replay', taskId: hit.taskId };
    return { status: 'in_flight' };
  }
  claims.set(key, { taskId: null, at: now });
  return { status: 'fresh' };
}

export function completeCreateClaim(userId: string, token: string, taskId: string, now = Date.now()): void {
  if (!token || !taskId) return;
  claims.set(claimKey(userId, token), { taskId, at: now });
}

export function releaseCreateClaim(userId: string, token: string): void {
  if (!token) return;
  const key = claimKey(userId, token);
  const hit = claims.get(key);
  if (hit && !hit.taskId) claims.delete(key);
}
