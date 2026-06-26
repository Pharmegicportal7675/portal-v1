import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/db/admin';
import { getAllActivityLogs } from '@/services/activity-logs';
import ActivityLogsDashboard from '@/components/ActivityLogsDashboard';

export const revalidate = 0;

export default async function ActivityLogsPage() {
  const session = await getSession();
  if (!session || session.role !== 'SUPER_ADMIN') {
    redirect('/admin?error=Unauthorized');
  }

  const adminSupabase = createAdminClient();
  const logs = await getAllActivityLogs(adminSupabase, { limit: 1000 });

  return <ActivityLogsDashboard initialLogs={logs} />;
}
