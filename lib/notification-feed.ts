import 'server-only';

import { prisma } from '@/lib/prisma';
import {
  TCC_REVIEW_NOTIFICATION_TITLES,
  newTccApplicationMessage,
  updatedTccApplicationMessage,
  type NotificationRow,
} from '@/lib/notifications';

const UNREAD_LIMIT = 100;
const RECENT_READ_LIMIT = 20;
const STALE_CLEAR_INTERVAL_MS = 60_000;

let lastStaleClearAt = 0;
let staleClearInFlight: Promise<void> | null = null;

function toNotificationRow(row: {
  id: string;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  created_at: Date;
}): NotificationRow {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    link: row.link,
    read: row.read,
    created_at: row.created_at.toISOString(),
  };
}

function linkedApplicationId(link: string | null | undefined) {
  if (!link) return null;
  const match = link.match(/[?&]app=([^&]+)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/** Mark "review this application" alerts read once the application is no longer waiting. */
export async function markNewTccApplicationNotificationsRead(input: {
  applicationId: string;
  companyName?: string | null;
  quantityMt?: unknown;
  chemicalName?: string | null;
}) {
  const messages = input.chemicalName
    ? [
        newTccApplicationMessage(input.companyName || 'A client', input.quantityMt, input.chemicalName),
        updatedTccApplicationMessage(input.companyName || 'A client', input.quantityMt, input.chemicalName),
      ]
    : [];

  await prisma.notifications.updateMany({
    where: {
      read: false,
      title: { in: [...TCC_REVIEW_NOTIFICATION_TITLES] },
      OR: [
        { link: { contains: input.applicationId } },
        ...messages.map((message) => ({ message })),
      ],
    },
    data: { read: true },
  });
}

/** Clear review alerts whose application is no longer pending. */
export async function clearResolvedTccReviewNotifications() {
  const [pending, unread] = await Promise.all([
    prisma.tcc_applications.findMany({
      where: { status: 'pending' },
      select: {
        id: true,
        quantity_mt: true,
        clients: { select: { company_name: true } },
        chemicals: { select: { chemical_name: true } },
      },
    }),
    prisma.notifications.findMany({
      where: { title: { in: [...TCC_REVIEW_NOTIFICATION_TITLES] }, read: false },
      select: { id: true, message: true, link: true },
    }),
  ]);

  if (unread.length === 0) return;

  const pendingIds = new Set(pending.map((app) => app.id));
  const pendingMessages = new Set(
    pending.flatMap((app) => {
      const company = app.clients?.company_name || 'A client';
      const chemical = app.chemicals?.chemical_name || '';
      return [
        newTccApplicationMessage(company, app.quantity_mt, chemical),
        updatedTccApplicationMessage(company, app.quantity_mt, chemical),
      ];
    })
  );

  const staleIds = unread
    .filter((row) => {
      const linkedId = linkedApplicationId(row.link);
      if (linkedId && pendingIds.has(linkedId)) return false;
      if (pendingMessages.has(row.message)) return false;
      return true;
    })
    .map((row) => row.id);

  if (staleIds.length === 0) return;

  await prisma.notifications.updateMany({
    where: { id: { in: staleIds } },
    data: { read: true },
  });
}

async function clearResolvedTccReviewNotificationsThrottled() {
  if (Date.now() - lastStaleClearAt < STALE_CLEAR_INTERVAL_MS) return;
  if (!staleClearInFlight) {
    staleClearInFlight = clearResolvedTccReviewNotifications()
      .then(() => {
        lastStaleClearAt = Date.now();
      })
      .catch((error) => {
        console.error('[notifications] Failed to clear resolved TCC review alerts:', error);
      })
      .finally(() => {
        staleClearInFlight = null;
      });
  }
  await staleClearInFlight;
}

export async function getUserNotificationFeed(userId: string): Promise<{
  notifications: NotificationRow[];
  unreadCount: number;
}> {
  await clearResolvedTccReviewNotificationsThrottled();

  const [unreadCount, unreadRows, readRows] = await Promise.all([
    prisma.notifications.count({
      where: { user_id: userId, read: false },
    }),
    prisma.notifications.findMany({
      where: { user_id: userId, read: false },
      orderBy: { created_at: 'desc' },
      take: UNREAD_LIMIT,
      select: {
        id: true,
        title: true,
        message: true,
        link: true,
        read: true,
        created_at: true,
      },
    }),
    prisma.notifications.findMany({
      where: { user_id: userId, read: true },
      orderBy: { created_at: 'desc' },
      take: RECENT_READ_LIMIT,
      select: {
        id: true,
        title: true,
        message: true,
        link: true,
        read: true,
        created_at: true,
      },
    }),
  ]);

  const notifications = [...unreadRows, ...readRows]
    .map(toNotificationRow)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return { notifications, unreadCount };
}
