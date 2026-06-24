import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/db/admin';
import CertificatesList from '@/components/CertificatesList';
import { redirect } from 'next/navigation';
import { clientHasEuReachRegistration } from '@/lib/regulatory-registrations';

export const revalidate = 0;

export default async function CertificatesPage() {
  const session = await getSession();
  if (!session || session.role !== 'CLIENT') redirect('/login');

  const clientId = session.clientId;
  if (!clientId) {
    return (
      <div className="py-12 text-center text-sm font-semibold text-slate-400">
        Your user account is not linked to a registered client organization.
      </div>
    );
  }

  const adminSupabase = createAdminClient();
  const { data: client } = await adminSupabase
    .from('clients')
    .select('regulatory_registrations')
    .eq('id', clientId)
    .single();

  if (!clientHasEuReachRegistration(client?.regulatory_registrations)) {
    redirect('/client');
  }

  const { data: certificatesRaw } = await adminSupabase
    .from('certificates')
    .select(
      '*, chemicals(chemical_name, cas_number, ec_number, tonnage_band), tcc_applications!certificates_tcc_application_id_fkey(quantity_mt, chemicals(chemical_name, cas_number))'
    )
    .eq('client_id', clientId)
    .order('issued_at', { ascending: false });

  const certificates = (certificatesRaw || []).map(
    (row: {
      chemicals?: unknown;
      tcc_applications?: { chemicals?: unknown; quantity_mt?: number } | null;
    }) => ({
      ...row,
      chemicals: Array.isArray(row.chemicals) ? row.chemicals[0] : row.chemicals,
      tcc_applications: row.tcc_applications
        ? {
            ...row.tcc_applications,
            chemicals: Array.isArray(row.tcc_applications.chemicals)
              ? row.tcc_applications.chemicals[0]
              : row.tcc_applications.chemicals,
          }
        : null,
    })
  );

  return <CertificatesList initialCertificates={certificates as any} />;
}
