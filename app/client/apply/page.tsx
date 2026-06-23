import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/db/admin';
import TccApplicationForm from '@/components/TccApplicationForm';
import { redirect } from 'next/navigation';

export const revalidate = 0;

import { mapAllReachByChemical, REACH_CERTIFICATE_TYPE, getReachCertificateStatus } from '@/lib/reach-certificate';
import { normalizeRegulatoryRegistrations } from '@/lib/regulatory-registrations';
import { canClientEditTccApplication } from '@/lib/tcc-application';

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
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

  const { edit: editId } = await searchParams;
  const adminSupabase = createAdminClient();

  const [{ data: mappings }, { data: approvedTccs }, { data: reachCerts }, { data: client }] =
    await Promise.all([
      adminSupabase
        .from('client_chemicals')
        .select('chemical_id, available_quantity, validity_date, chemicals(*)')
        .eq('client_id', clientId)
        .eq('status', 'active'),
      adminSupabase
        .from('tcc_applications')
        .select(
          'id, chemical_id, quantity_mt, status, export_date, reach_certificate_id, updated_at, created_at, certificates!certificates_tcc_application_id_fkey(issued_at)'
        )
        .eq('client_id', clientId)
        .eq('status', 'approved'),
      adminSupabase
        .from('certificates')
        .select(
          'id, chemical_id, certificate_number, issued_at, expires_at, status, type, file_url, allocated_quantity, tonnage_band'
        )
        .eq('client_id', clientId)
        .eq('type', REACH_CERTIFICATE_TYPE)
        .order('issued_at', { ascending: false }),
      adminSupabase
        .from('clients')
        .select('regulatory_registrations')
        .eq('id', clientId)
        .single(),
    ]);

  let editApplication = null;
  if (editId) {
    const { data: existingApp } = await adminSupabase
      .from('tcc_applications')
      .select(
        'id, chemical_id, quantity_mt, export_date, eu_importer_company_name, eu_importer_address, purchase_order_number, invoice_number, bo_attachment_url, bo_attachment_name, regulatory_framework, status'
      )
      .eq('id', editId)
      .eq('client_id', clientId)
      .maybeSingle();

    if (existingApp && canClientEditTccApplication(existingApp.status)) {
      editApplication = existingApp;
    }
  }

  const reachByChemical = mapAllReachByChemical(reachCerts || []);

  const authorizedSubstances = (mappings || [])
    .map((m: { chemical_id: string; available_quantity?: number; validity_date?: string | null; chemicals?: unknown }) => {
      const chem = Array.isArray(m.chemicals) ? m.chemicals[0] : m.chemicals;
      if (!chem || (chem as { status?: string }).status !== 'active') return null;

      const chemicalReachCerts = reachByChemical.get(m.chemical_id) ?? [];
      const reachCertificates = chemicalReachCerts.map((cert) => ({
        id: cert.id,
        certificate_number: cert.certificate_number,
        issued_at: cert.issued_at,
        expires_at: cert.expires_at,
        file_url: cert.file_url,
        allocated_quantity: cert.allocated_quantity ?? null,
        tonnage_band: cert.tonnage_band ?? null,
        status: getReachCertificateStatus(cert),
      }));

      return {
        ...chem,
        id: m.chemical_id,
        available_quantity: Number(m.available_quantity ?? 0),
        validity_date: m.validity_date ?? (chem as { validity_date?: string | null }).validity_date ?? null,
        tonnage_band: (chem as { tonnage_band?: string | null }).tonnage_band ?? null,
        reach_certificates: reachCertificates,
        has_reach_history: reachCertificates.length > 0,
      };
    })
    .filter(Boolean);

  return (
    <TccApplicationForm
      authorizedSubstances={authorizedSubstances as any}
      approvedExports={approvedTccs || []}
      regulatoryRegistrations={normalizeRegulatoryRegistrations(client?.regulatory_registrations)}
      editApplication={editApplication}
    />
  );
}
