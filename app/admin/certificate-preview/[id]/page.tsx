import { createAdminClient } from '@/lib/db/admin';
import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import CertificatePreviewClient from '@/components/CertificatePreview';
import {
  loadCertificateMailSentHistory,
  TCC_MAIL_LOG_ACTIONS,
} from '@/lib/certificate-mail-history';

export const revalidate = 0;

export default async function CertificatePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();

  if (!session || (session.role !== 'MASTER_ADMIN' && session.role !== 'SUPER_ADMIN')) {
    redirect('/login');
  }

  const adminSupabase = createAdminClient();

  const { data: cert, error } = await adminSupabase
    .from('certificates')
    .select(`
      id,
      client_id,
      chemical_id,
      certificate_number,
      type,
      file_url,
      issued_at,
      expires_at,
      status,
      mail_sent,
      mail_sent_at,
      mail_resend_count,
      last_resend_at,
      mail_sent_history,
      registration_number,
      tonnage_band,
      clients (
        company_name,
        legal_name,
        email,
        registration_number,
        address,
        city,
        state,
        postal_code,
        country,
        uuid_number
      ),
      chemicals (
        chemical_name,
        cas_number,
        ec_number,
        tonnage_band
      ),
      tcc_applications!certificates_tcc_application_id_fkey (
        id,
        quantity_mt,
        registration_number,
        export_date,
        remarks,
        eu_importer_company_name,
        eu_importer_address,
        purchase_order_number,
        invoice_number,
        tracking_id,
        status,
        created_at,
        updated_at,
        chemicals (
          chemical_name,
          cas_number,
          ec_number,
          tonnage_band
        )
      )
    `)
    .eq('id', id)
    .single();

  if (error || !cert) {
    redirect('/admin/approvals');
  }

  if (cert.type === 'REACH' && cert.client_id && cert.chemical_id) {
    redirect(`/admin/clients/${cert.client_id}/rc-preview/${cert.chemical_id}`);
  }

  const mailSentHistory = cert.mail_sent
    ? await loadCertificateMailSentHistory(adminSupabase, cert.id, cert, TCC_MAIL_LOG_ACTIONS)
    : [];

  return <CertificatePreviewClient cert={cert as any} mailSentHistory={mailSentHistory} />;
}
