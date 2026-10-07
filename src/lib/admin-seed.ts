import { DEFAULT_AUDIO_MODEL } from './ai.ts';

export const ADMIN_SETTINGS_MODEL = DEFAULT_AUDIO_MODEL;
export const DEFAULT_ADMIN_NAME = 'Admin';

export function adminPasswordError(value: string | undefined): string | null {
  const password = typeof value === 'string' ? value : '';
  if (!password) return 'ADMIN_PASSWORD is required';
  if (password.length < 6) return 'ADMIN_PASSWORD must be at least 6 characters';
  return null;
}

export function normalizeAdminName(value: string | undefined): string {
  const name = typeof value === 'string' ? value.trim() : '';
  return name || DEFAULT_ADMIN_NAME;
}

export function deriveLoginEmail(name: string, taken: boolean, now = Date.now()): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
  if (!taken) return `${base}@bossnote.id`;
  return `${base}-${now.toString(36)}@bossnote.id`;
}
