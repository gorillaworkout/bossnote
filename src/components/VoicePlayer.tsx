'use client';

import { useEffect, useState } from 'react';

/**
 * Streams a cookie-gated voice note. `<audio src="/api/voice/...">` can omit
 * the session cookie (SW-intercepted media / some browsers); fetch + object URL
 * always sends same-origin credentials.
 */
export function VoicePlayer({ src, className }: { src: string; className?: string }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    setObjectUrl(null);
    setError(null);

    (async () => {
      try {
        const res = await fetch(src, { credentials: 'same-origin', cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) {
            setError(res.status === 401 ? 'Sign in to play this voice note' : 'Voice note unavailable');
          }
          return;
        }
        const blob = await res.blob();
        if (cancelled) return;
        created = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(created);
          return;
        }
        setObjectUrl(created);
      } catch {
        if (!cancelled) setError('Voice note unavailable');
      }
    })();

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [src]);

  if (error) {
    return <p className="text-[12px] text-zinc-600 mb-2">{error}</p>;
  }

  if (!objectUrl) {
    return <audio controls className={className} preload="none" />;
  }

  return <audio controls className={className} src={objectUrl} preload="metadata" />;
}
