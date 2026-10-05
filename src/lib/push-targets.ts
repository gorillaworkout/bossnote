/**
 * One user can have many devices. Keep every distinct endpoint.
 * Duplicate rows for the same endpoint are collapsed so a retry does not double-send.
 */
export function uniqueSubscriptions<T extends { endpoint: string }>(subs: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const sub of subs) {
    const endpoint = typeof sub.endpoint === 'string' ? sub.endpoint.trim() : '';
    if (!endpoint || seen.has(endpoint)) continue;
    seen.add(endpoint);
    out.push(sub);
  }
  return out;
}
