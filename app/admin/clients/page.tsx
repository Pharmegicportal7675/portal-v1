import { createAdminClient } from '@/lib/db/admin';
import { getClients, getChemicals, getActiveSubstanceCountsByClient } from '@/services/db';
import { getSession } from '@/lib/auth/session';
import ClientsDashboard from '@/components/ClientsDashboard';

export const revalidate = 0;

export default async function ClientsPage() {
  const supabase = createAdminClient();
  const session = await getSession();

  // Load initial clients (limit 1000 for full visibility in registry)
  const { clients } = await getClients(supabase, '', 'all', 1000, 0);
  const [substanceCounts, chemicals] = await Promise.all([
    getActiveSubstanceCountsByClient(
      supabase,
      clients.map((client: any) => client.id)
    ),
    getChemicals(supabase, '', 'active'),
  ]);
  const clientsWithSubstanceCounts = clients.map((client: any) => ({
    ...client,
    substance_count: substanceCounts[client.id] || 0,
  }));

  return (
    <ClientsDashboard
      initialClients={clientsWithSubstanceCounts as any}
      chemicals={chemicals as any}
      adminRole={session?.role ?? null}
    />
  );
}

