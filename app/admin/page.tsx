import { createAdminClient } from '@/lib/db/admin';
import { getAdminDashboardStats } from '@/services/db';
import AdminDashboard from '@/components/AdminDashboard';

export const revalidate = 30;

export default async function AdminDashboardPage() {
  const supabase = createAdminClient();
  const { stats, reachStats } = await getAdminDashboardStats(supabase);

  return <AdminDashboard stats={stats} reachStats={reachStats} />;
}
