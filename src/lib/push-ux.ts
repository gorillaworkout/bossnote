export type PushPermission = 'default' | 'granted' | 'denied' | 'unknown';

export type PushBannerMode = 'ios-install' | 'enable' | 'denied' | 'granted' | 'unsupported';

/**
 * iOS Safari only delivers Web Push from the installed PWA.
 * Show Add to Home Screen before asking for notification permission.
 */
export function pushBannerMode(input: {
  ios: boolean;
  standalone: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  permission: PushPermission;
}): PushBannerMode {
  if (input.ios && !input.standalone) return 'ios-install';
  if (!input.hasServiceWorker || !input.hasPushManager || !input.hasNotification) return 'unsupported';
  if (input.permission === 'denied') return 'denied';
  if (input.permission === 'granted') return 'granted';
  return 'enable';
}
