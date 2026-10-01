'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchTccStatusFeed } from '@/actions/live-updates';
import type { TccStatusUpdate } from '@/lib/tcc-status-sync';

const POLL_MS = 4000;

function feedKey(rows: TccStatusUpdate[]) {
  return rows
    .map((row) => `${row.id}:${row.status}:${row.updated_at}:${row.certificate?.certificate_number ?? ''}`)
    .join('|');
}

/** Poll TCC application status so open lists update without a manual reload. */
export function useTccStatusFeed() {
  const [updates, setUpdates] = useState<TccStatusUpdate[]>([]);
  const keyRef = useRef('');

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    const poll = async () => {
      if (cancelled || inFlight || document.hidden) return;
      inFlight = true;
      try {
        const result = await fetchTccStatusFeed();
        if (cancelled || !result.success) return;
        const key = feedKey(result.rows);
        if (key === keyRef.current) return;
        keyRef.current = key;
        setUpdates(result.rows);
      } catch {
        // Keep the last status snapshot if a poll fails.
      } finally {
        inFlight = false;
      }
    };

    const onVisible = () => {
      if (!document.hidden) void poll();
    };

    const intervalId = window.setInterval(() => {
      void poll();
    }, POLL_MS);
    document.addEventListener('visibilitychange', onVisible);
    void poll();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return updates;
}
