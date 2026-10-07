'use client';

import { useEffect, useState } from 'react';
import {
  pushBannerDismissKey,
  pushBannerMode,
  pushDeniedCopy,
  shouldShowPushBanner,
  type PushBannerMode,
  type PushPermission,
  type PushPlatform,
} from '@/lib/push-ux';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

type Phase = 'hidden' | PushBannerMode | 'ready';

function detectPlatform(): PushPlatform {
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

function bannerDismissed(mode: PushBannerMode): boolean {
  const key = pushBannerDismissKey(mode);
  if (!key) return false;
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
}

function detectStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

function currentMode(): PushBannerMode {
  const permission: PushPermission = 'Notification' in window
    ? (Notification.permission as PushPermission)
    : 'unknown';
  return pushBannerMode({
    ios: detectPlatform() === 'ios',
    standalone: detectStandalone(),
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
    permission,
  });
}

async function subscribeAndSave(): Promise<{ ok: boolean; error?: string }> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { ok: false, error: 'This browser cannot receive push yet.' };
  }

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, error: permission === 'denied'
      ? 'Notifications are blocked for BossNote.'
      : 'Notification permission was not granted.' };
  }

  const vapid = await fetch('/api/push/vapid');
  if (!vapid.ok) return { ok: false, error: 'Push is not configured on the server yet.' };
  const { publicKey } = await vapid.json() as { publicKey?: string };
  if (!publicKey) return { ok: false, error: 'Push is not configured on the server yet.' };

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  });

  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!res.ok) return { ok: false, error: 'Could not save this device. Tap Enable Push to retry.' };
  return { ok: true };
}

export function PushEnableBanner() {
  const [phase, setPhase] = useState<Phase>('hidden');
  const [platform, setPlatform] = useState<PushPlatform>('desktop');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testNote, setTestNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const mode = currentMode();
      setPlatform(detectPlatform());
      if (mode === 'unsupported') return;
      if (mode === 'granted') {
        void subscribeAndSave().then((result) => {
          if (cancelled || result.ok) return;
          if (bannerDismissed('enable')) return;
          setError(result.error || 'This device is not registered yet.');
          setPhase('enable');
        });
        return;
      }
      if (!shouldShowPushBanner(mode, bannerDismissed(mode))) return;
      setPhase(mode);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  if (phase === 'hidden' || phase === 'unsupported' || phase === 'granted') return null;

  const enable = async () => {
    setBusy(true);
    setError(null);
    setTestNote(null);
    try {
      const result = await subscribeAndSave();
      if (result.ok) {
        localStorage.removeItem('bn_push_banner_dismissed');
        setPhase('ready');
        return;
      }
      setError(result.error || 'Could not enable push.');
      if (currentMode() === 'denied') setPhase('denied');
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/push/test', { method: 'POST' });
      const data = await res.json().catch(() => ({})) as { error?: string; sent?: number };
      if (!res.ok) {
        setError(data.error || 'Test notification failed.');
        return;
      }
      const sent = data.sent ?? 0;
      if (sent < 1) {
        setError('No device is registered yet. Tap Enable Push again.');
        return;
      }
      setTestNote(`Test sent to ${sent} device${sent === 1 ? '' : 's'}.`);
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () => {
    const key = pushBannerDismissKey(phase === 'ios-install' ? 'ios-install' : 'denied');
    if (key) {
      try { localStorage.setItem(key, '1'); } catch { /* private mode */ }
    }
    setPhase('hidden');
  };

  return (
    <div className="bg-indigo-950/40 border-b border-indigo-800/40 text-indigo-100 text-[12px] px-4 py-2.5 flex-shrink-0">
      {phase === 'ios-install' && (
        <div className="leading-relaxed">
          <p className="font-medium text-indigo-50">Add to Home Screen first</p>
          <p className="text-indigo-200 mt-1">
            On iPhone, Web Push only works in the installed app. In Safari tap Share, then Add to Home Screen. Open BossNote from that icon and tap Enable Push.
          </p>
        </div>
      )}
      {phase === 'enable' && (
        <p className="leading-relaxed text-indigo-100">
          Enable Push so new tasks and the daily reminder appear on this device&apos;s lock screen. Each phone you enable is stored separately — your other devices stay registered.
        </p>
      )}
      {phase === 'denied' && (
        <p className="leading-relaxed text-indigo-100">
          {pushDeniedCopy(platform)}
        </p>
      )}
      {phase === 'ready' && (
        <p className="leading-relaxed text-emerald-200">
          Push is on for this device. Other phones you already enabled stay registered too.
        </p>
      )}
      {error && <p className="text-red-300 mt-1 leading-relaxed">{error}</p>}
      {testNote && <p className="text-emerald-300 mt-1">{testNote}</p>}
      <div className="flex items-center gap-2 mt-2">
        {(phase === 'enable' || phase === 'denied') && (
          <button
            type="button"
            onClick={() => { void enable(); }}
            disabled={busy}
            className="px-2.5 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-[12px] font-medium disabled:opacity-50"
          >
            {busy ? 'Enabling…' : 'Enable Push'}
          </button>
        )}
        {phase === 'ready' && (
          <button
            type="button"
            onClick={() => { void sendTest(); }}
            disabled={busy}
            className="px-2.5 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-[12px] font-medium disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Send test'}
          </button>
        )}
        <button type="button" onClick={dismiss} className="text-indigo-300 hover:text-indigo-100 text-[12px] px-1 py-1">
          Dismiss
        </button>
      </div>
    </div>
  );
}
