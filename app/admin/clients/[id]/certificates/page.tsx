import ClientDashboardDetails from '@/components/ClientDashboardDetailsLazy';
import { loadClientProfileData } from '../load-client-data';

export const revalidate = 0;

export default async function ClientCertificatesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadClientProfileData(id);
  const { session, ...profile } = data;

  return (
    <ClientDashboardDetails
      {...profile}
      currentUserId={session.userId}
      currentUserRole={session.role}
      viewMode="certificates"
    />
  );
}
