'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { fetchPortalLiveState } from '@/actions/live-updates';
import type { NotificationRow } from '@/lib/notifications';

const POLL_MS = 8000;

function notificationKey(items: NotificationRow[], unreadCount: number) {
  return `${unreadCount}|${items.map((item) => `${item.id}:${item.read}:${item.created_at}`).join(',')}`;
}

/** Form pages keep typed input; lists and dashboards pick up status changes. */
function shouldRefreshStatus(pathname: string) {
  if (pathname.includes('/apply')) return false;
  if (pathname.includes('/edit')) return false;
  if (pathname.endsWith('/new')) return false;
  if (pathname.includes('/certificate-preview')) return false;
  if (pathname.includes('/rc-preview')) return false;
  return true;
}

export function usePortalLiveSync(
  initialNotifications: NotificationRow[],
  initialUnreadCount: number
) {
  const router = useRouter();
  const pathname = usePathname();
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);

  const statusTokenRef = useRef<string | null>(null);
  const notificationKeyRef = useRef(notificationKey(initialNotifications, initialUnreadCount));
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    const key = notificationKey(initialNotifications, initialUnreadCount);
    if (key === notificationKeyRef.current) return;
    notificationKeyRef.current = key;
    setNotifications(initialNotifications);
    setUnreadCount(initialUnreadCount);
  }, [initialNotifications, initialUnreadCount]);

  useEffect(() => {
    statusTokenRef.current = null;
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    const applyNotifications = (items: NotificationRow[], unread: number) => {
      const key = notificationKey(items, unread);
      if (key === notificationKeyRef.current) return;
      notificationKeyRef.current = key;
      setNotifications(items);
      setUnreadCount(unread);
    };

    const poll = async () => {
      if (cancelled || inFlight || document.hidden) return;
      inFlight = true;
      const pathAtStart = pathnameRef.current;
      try {
        const result = await fetchPortalLiveState();
        if (cancelled || !result.success || pathnameRef.current !== pathAtStart) return;

        applyNotifications(result.data.notifications, result.data.unreadCount);

        if (statusTokenRef.current === null) {
          statusTokenRef.current = result.data.statusToken;
          return;
        }

        if (statusTokenRef.current !== result.data.statusToken) {
          statusTokenRef.current = result.data.statusToken;
          if (shouldRefreshStatus(pathnameRef.current)) {
            router.refresh();
          }
        }
      } catch {
        // Keep the last known notifications and status if a poll fails.
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
  }, [router]);

  return { notifications, unreadCount };
}
