import { createAdminClient } from '@/lib/db/admin';
import { reconcileMissingTccCertificates } from '@/lib/tcc-certificate-issuance';
import { getTccApplications } from '@/services/db';
import ApprovalsDashboard from '@/components/ApprovalsDashboard';

export const revalidate = 0; // Live updates for admin approvals

export default async function ApprovalsPage() {
  const supabase = createAdminClient();

  await reconcileMissingTccCertificates(supabase);

  const [applications, { data: adminSettings }] = await Promise.all([
    getTccApplications(supabase, 'all', { euReachOnly: true }),
    supabase.from('admin_settings').select('smtp_from, smtp_cc_default').eq('id', 1).maybeSingle(),
  ]);

  return (
    <ApprovalsDashboard
      initialApplications={applications as any}
      emailDefaults={{
        defaultCcEmails: adminSettings?.smtp_cc_default ?? null,
        senderEmail: adminSettings?.smtp_from ?? null,
      }}
    />
  );
}
