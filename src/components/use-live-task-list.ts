'use client';

import { useEffect, useRef } from 'react';
import { TASK_EVENTS_PATH, createCoalescedRefresh } from '@/lib/task-list-live';

const REFRESH_WAIT_MS = 200;

/**
 * Subscribe while the dashboard is open. EventSource reconnects on its own
 * (the stream sends `retry`). A dropped connection refetches on the next open,
 * and returning to a background tab refetches in case the browser suspended the stream.
 */
export function useLiveTaskList(enabled: boolean, refresh: () => void | Promise<void>) {
  const refreshRef = useRef(refresh);

  useEffect(() => {
    refreshRef.current = refresh;
  });

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;

    const coalesced = createCoalescedRefresh(() => {
      void Promise.resolve(refreshRef.current()).catch((err) => {
        console.error('[bossnote] live task refresh failed', err);
      });
    }, REFRESH_WAIT_MS);

    const source = new EventSource(TASK_EVENTS_PATH, { withCredentials: true });
    let connected = false;
    source.onopen = () => {
      if (connected) coalesced.kick();
      connected = true;
    };
    source.addEventListener('tasks', () => {
      coalesced.kick();
    });

    const onVisible = () => {
      if (document.visibilityState === 'visible') coalesced.kick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      coalesced.stop();
      source.close();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);
}
