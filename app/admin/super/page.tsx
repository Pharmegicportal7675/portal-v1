import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import SuperAdminDashboard from '@/components/SuperAdminDashboard';

export const revalidate = 0;

export default async function SuperAdminPage() {
  const session = await getSession();
  if (!session || session.role !== 'SUPER_ADMIN') {
    redirect('/admin?error=Unauthorized');
  }

  const adminSupabase = createAdminClient();
  const { data: admins } = await adminSupabase
    .from('users')
    .select('id, email, is_disabled, created_at')
    .eq('role', 'MASTER_ADMIN')
    .order('created_at', { ascending: false });

  return <SuperAdminDashboard initialAdmins={admins || []} />;
}
