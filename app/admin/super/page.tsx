import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/db/admin';
import { redirect } from 'next/navigation';
import SuperAdminDashboard from '@/components/SuperAdminDashboard';

export const revalidate = 0;

export default async function SuperAdminPage() {
  const session = await getSession();
  if (!session || session.role !== 'SUPER_ADMIN') {
    redirect('/admin?error=Unauthorized');
  }

  // Keep SSR light — Only For You lists load client-side to avoid MySQL pool timeouts
  // when scanning many certificate/PO paths in parallel with other admin queries.
  const adminSupabase = createAdminClient();
  const { data: admins } = await adminSupabase
    .from('users')
    .select('id, email, is_disabled, created_at')
    .eq('role', 'MASTER_ADMIN')
    .order('created_at', { ascending: false });

  return (
    <SuperAdminDashboard
      initialAdmins={admins || []}
      initialMissingPos={[]}
      initialCertificates={[]}
    />
  );
}
