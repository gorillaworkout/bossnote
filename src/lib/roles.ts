export const ADMIN_USER_ID = 'admin-001';

export const APP_ROLES = ['admin', 'boss', 'member'] as const;
export type AppRole = (typeof APP_ROLES)[number];

export function isAppRole(role: string): role is AppRole {
  return role === 'admin' || role === 'boss' || role === 'member';
}
