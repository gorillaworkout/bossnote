'use client';

import { useEffect, useState } from 'react';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

async function subscribeAndSave(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return false;
  }

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const vapid = await fetch('/api/push/vapid');
  if (!vapid.ok) return false;
  const { publicKey } = await vapid.json() as { publicKey?: string };
  if (!publicKey) return false;

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
  return res.ok;
}

export function PushEnableBanner() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    if (Notification.permission === 'granted') {
      void subscribeAndSave();
      return;
    }
    if (localStorage.getItem('bn_push_banner_dismissed') === '1') return;

    if (Notification.permission === 'default' || Notification.permission === 'denied') {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const enable = async () => {
    setBusy(true);
    try {
      const ok = await subscribeAndSave();
      if (ok) {
        localStorage.removeItem('bn_push_banner_dismissed');
        setVisible(false);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-indigo-950/40 border-b border-indigo-800/40 text-indigo-200 text-[12px] flex items-center gap-2 px-4 py-2 flex-shrink-0">
      <span className="flex-1">Enable phone notifications so new tasks and the daily reminder appear on your lock screen.</span>
      <button
        type="button"
        onClick={() => { void enable(); }}
        disabled={busy}
        className="px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium disabled:opacity-50"
      >
        {busy ? 'Enabling…' : 'Enable'}
      </button>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem('bn_push_banner_dismissed', '1');
          setVisible(false);
        }}
        className="text-indigo-400/80 hover:text-indigo-200"
      >
        Dismiss
      </button>
    </div>
  );
}
