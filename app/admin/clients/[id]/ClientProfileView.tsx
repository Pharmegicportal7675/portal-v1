'use client';

import ClientDashboardDetails from '@/app/admin/clients/[id]/ClientDashboardDetails';
import { useClientProfileData } from './client-profile-context';
import type { ClientProfileViewMode } from './load-client-data';

export function ClientProfileView({ viewMode }: { viewMode: ClientProfileViewMode }) {
  const data = useClientProfileData();
  const { session, ...profile } = data;

  return (
    <ClientDashboardDetails
      {...profile}
      currentUserId={session.userId}
      currentUserRole={session.role}
      viewMode={viewMode}
    />
  );
}
