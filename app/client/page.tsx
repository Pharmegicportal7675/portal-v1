import { getSession } from '@/lib/auth/session';
import ClientDashboardDetails from '@/components/ClientDashboardDetailsLazy';
import { loadClientPortalData } from '@/app/admin/clients/[id]/load-client-data';
import { redirect } from 'next/navigation';

export const revalidate = 30;

export default async function ClientDashboardPage() {
  const session = await getSession();
  if (!session || session.role !== 'CLIENT') redirect('/login');

  const clientId = session.clientId;
  if (!clientId) {
    return (
      <div className="py-12 text-center text-sm font-semibold text-slate-400">
        Your user account is not linked to a registered client organization. Please contact your system administrator.
      </div>
    );
  }

  const data = await loadClientPortalData(clientId);
  if (!data) {
    return <div className="py-12 text-center text-sm font-semibold text-slate-400">Client profile not found.</div>;
  }

  return (
    <ClientDashboardDetails
      client={data.client}
      user={data.user}
      clientChemicals={data.clientChemicals}
      allChemicals={[]}
      contacts={data.contacts}
      tccHistory={data.tccHistory}
      certificates={data.certificates}
      activityLogs={data.activityLogs}
      internalNotes={[]}
      currentUserId={session.userId}
      currentUserRole={session.role}
    />
  );
}
