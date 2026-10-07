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

export type PushPlatform = 'ios' | 'android' | 'desktop';

/** Blocked-notification copy follows the browser the banner is actually on. */
export function pushDeniedCopy(platform: PushPlatform): string {
  if (platform === 'ios') {
    return 'Notifications are blocked. On iPhone open Settings → Notifications → BossNote and allow them, then reopen this app and tap Enable Push.';
  }
  if (platform === 'android') {
    return 'Notifications are blocked. In your browser tap the lock icon, allow notifications for BossNote, then tap Enable Push.';
  }
  return 'Notifications are blocked in this browser. Click the lock icon in the address bar, allow notifications for BossNote, then tap Enable Push.';
}

export function pushBannerDismissKey(mode: PushBannerMode): string | null {
  if (mode === 'ios-install') return 'bn_push_ios_dismissed';
  if (mode === 'enable' || mode === 'denied') return 'bn_push_banner_dismissed';
  return null;
}

/** A stored dismiss hides the banner until the user successfully turns push on. */
export function shouldShowPushBanner(mode: PushBannerMode, dismissed: boolean): boolean {
  if (mode === 'unsupported' || mode === 'granted') return false;
  if (dismissed) return false;
  return mode === 'ios-install' || mode === 'enable' || mode === 'denied';
}
