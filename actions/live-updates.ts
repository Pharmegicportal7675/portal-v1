'use server';

import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth/session';
import { getUserNotificationFeed } from '@/lib/notification-feed';
import type { NotificationRow } from '@/lib/notifications';

export type PortalLiveState = {
  notifications: NotificationRow[];
  unreadCount: number;
  /** Changes when an application or certificate status is inserted, updated, or removed. */
  statusToken: string;
};

function stamp(value: Date | null | undefined) {
  if (!value) return '';
  return value.toISOString();
}

function statusTokenFromGroups(
  groups: { status: string | null; _count: { _all: number }; _max: { updated_at: Date | null } }[]
) {
  return groups
    .map((group) => `${group.status ?? 'none'}:${group._count._all}:${stamp(group._max.updated_at)}`)
    .sort()
    .join('|');
}

export async function fetchPortalLiveState(): Promise<
  { success: true; data: PortalLiveState } | { success: false }
> {
  const session = await getSession();
  if (!session) return { success: false };

  const clientWhere =
    session.role === 'CLIENT' && session.clientId ? { client_id: session.clientId } : undefined;

  const [{ notifications, unreadCount }, applicationGroups, certificateGroups] = await Promise.all([
    getUserNotificationFeed(session.userId),
    prisma.tcc_applications.groupBy({
      by: ['status'],
      where: clientWhere,
      _count: { _all: true },
      _max: { updated_at: true },
    }),
    prisma.certificates.groupBy({
      by: ['status'],
      where: clientWhere,
      _count: { _all: true },
      _max: { updated_at: true },
    }),
  ]);

  return {
    success: true,
    data: {
      notifications,
      unreadCount,
      statusToken: `tcc:${statusTokenFromGroups(applicationGroups)};cert:${statusTokenFromGroups(certificateGroups)}`,
    },
  };
}
