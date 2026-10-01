'use server';

import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth/session';
import { getUserNotificationFeed } from '@/lib/notification-feed';
import type { NotificationRow } from '@/lib/notifications';
import type { TccStatusUpdate } from '@/lib/tcc-status-sync';

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

  const [{ notifications, unreadCount }, applicationGroups, certificateGroups, activityStamp] =
    await Promise.all([
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
    prisma.activity_logs.aggregate({
      where: clientWhere,
      _count: { _all: true },
      _max: { created_at: true },
    }),
  ]);

  return {
    success: true,
    data: {
      notifications,
      unreadCount,
      statusToken: `tcc:${statusTokenFromGroups(applicationGroups)};cert:${statusTokenFromGroups(certificateGroups)};act:${activityStamp._count._all}:${stamp(activityStamp._max.created_at)}`,
    },
  };
}

export async function fetchTccStatusFeed(): Promise<
  { success: true; rows: TccStatusUpdate[] } | { success: false }
> {
  const session = await getSession();
  if (!session) return { success: false };

  const clientWhere =
    session.role === 'CLIENT' && session.clientId ? { client_id: session.clientId } : undefined;

  const rows = await prisma.tcc_applications.findMany({
    where: clientWhere,
    select: {
      id: true,
      status: true,
      updated_at: true,
      quantity_mt: true,
      export_date: true,
      certificates_certificates_tcc_application_idTotcc_applications: {
        select: {
          id: true,
          certificate_number: true,
          file_url: true,
          issued_at: true,
          status: true,
        },
      },
    },
  });

  return {
    success: true,
    rows: rows.map((row) => {
      const certificate = row.certificates_certificates_tcc_application_idTotcc_applications;
      return {
        id: row.id,
        status: row.status ?? 'pending',
        updated_at: stamp(row.updated_at),
        quantity_mt: Number(String(row.quantity_mt ?? 0)),
        export_date: row.export_date ? stamp(row.export_date) : null,
        certificate: certificate
          ? {
              id: certificate.id,
              certificate_number: certificate.certificate_number,
              file_url: certificate.file_url,
              issued_at: stamp(certificate.issued_at),
              status: certificate.status ?? 'active',
            }
          : null,
      };
    }),
  };
}
