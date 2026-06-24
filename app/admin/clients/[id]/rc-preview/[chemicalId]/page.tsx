import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/db/admin';
import { getSession } from '@/lib/auth/session';
import ReachCertificatePreviewClient from '@/components/ReachCertificatePreviewClient';
import { getDefaultReachPeriodForYear, isReachCertificateType } from '@/lib/reach-certificate';
import { buildCertificateRecipients } from '@/lib/certificate-email-recipients';
import { resolveRcBranding } from '@/lib/certificate-template-config';
import { getActiveTemplate } from '@/services/db';
import {
  loadCertificateMailSentHistory,
  REACH_MAIL_LOG_ACTIONS,
} from '@/lib/certificate-mail-history';

export const revalidate = 0;
export const maxDuration = 120;

function toIsoString(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return String(value);
}

function toDateOnly(value: unknown): string {
  const iso = toIsoString(value);
  if (!iso) return '';
  return iso.split('T')[0];
}

type CertRow = {
  id: string;
  certificate_number: string;
  registration_number: string | null;
  tonnage_band: string | null;
  issued_at: unknown;
  expires_at: unknown;
  status: string;
  file_url: string | null;
  type?: string;
  chemical_id?: string | null;
  mail_sent?: boolean | null;
  mail_sent_at?: unknown;
  mail_resend_count?: number | null;
  last_resend_at?: unknown;
  mail_sent_history?: unknown;
};

function normalizeCertForClient(cert: CertRow) {
  return {
    id: String(cert.id),
    certificate_number: String(cert.certificate_number),
    registration_number: cert.registration_number?.trim() || null,
    issued_at: toIsoString(cert.issued_at) || '',
    expires_at: toIsoString(cert.expires_at),
    status: String(cert.status ?? ''),
    file_url: cert.file_url ? String(cert.file_url) : null,
    mail_sent: Boolean(cert.mail_sent),
    mail_sent_at: toIsoString(cert.mail_sent_at),
    mail_resend_count: Number(cert.mail_resend_count ?? 0),
    last_resend_at: toIsoString(cert.last_resend_at),
  };
}

export default async function ReachCertificatePreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; chemicalId: string }>;
  searchParams: Promise<{ certId?: string }>;
}) {
  const { id: clientId, chemicalId } = await params;
  const { certId: requestedCertId } = await searchParams;

  const session = await getSession();
  if (!session || (session.role !== 'MASTER_ADMIN' && session.role !== 'SUPER_ADMIN')) {
    redirect('/login');
  }

  const adminSupabase = createAdminClient();

  const [
    { data: client, error: clientError },
    { data: chemical, error: chemicalError },
    { data: clientChem },
    { data: cert },
    { data: contacts },
    { data: adminSettings },
  ] = await Promise.all([
    adminSupabase
      .from('clients')
      .select('id, company_name, email, uuid_number, address, city, state, postal_code, country')
      .eq('id', clientId)
      .single(),
    adminSupabase
      .from('chemicals')
      .select('id, chemical_name, cas_number, ec_number, tonnage_band')
      .eq('id', chemicalId)
      .single(),
    adminSupabase
      .from('client_chemicals')
      .select('id, validity_date, status, registration_number, issued_date, created_at')
      .eq('client_id', clientId)
      .eq('chemical_id', chemicalId)
      .neq('status', 'trashed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    requestedCertId
      ? adminSupabase
          .from('certificates')
          .select(
            'id, certificate_number, registration_number, tonnage_band, issued_at, expires_at, status, file_url, type, chemical_id, mail_sent, mail_sent_at, mail_resend_count, last_resend_at, mail_sent_history'
          )
          .eq('id', requestedCertId)
          .eq('client_id', clientId)
          .maybeSingle()
      : adminSupabase
          .from('certificates')
          .select(
            'id, certificate_number, registration_number, tonnage_band, issued_at, expires_at, status, file_url, type, chemical_id, mail_sent, mail_sent_at, mail_resend_count, last_resend_at, mail_sent_history'
          )
          .eq('client_id', clientId)
          .eq('chemical_id', chemicalId)
          .neq('status', 'revoked')
          .order('issued_at', { ascending: false })
          .limit(20),
    adminSupabase
      .from('client_contacts')
      .select('email')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false }),
    adminSupabase
      .from('admin_settings')
      .select('rc_smtp_from, rc_smtp_cc_default')
      .eq('id', 1)
      .maybeSingle(),
  ]);

  if (clientError || chemicalError || !client || !chemical) {
    redirect(`/admin/clients/${clientId}`);
  }

  const certList = Array.isArray(cert) ? cert : cert ? [cert] : [];
  const resolvedCertRaw =
    certList.find((row) => isReachCertificateType(row as CertRow)) ??
    (requestedCertId && cert && !Array.isArray(cert) && isReachCertificateType(cert as CertRow)
      ? cert
      : null);

  if (!clientChem && !resolvedCertRaw) {
    redirect(`/admin/clients/${clientId}`);
  }

  const resolvedCert = resolvedCertRaw
    ? normalizeCertForClient(resolvedCertRaw as CertRow)
    : null;

  const contactEmails = (contacts || [])
    .map((c: { email?: string | null }) => c.email)
    .filter(Boolean) as string[];

  const mailSentHistory = resolvedCertRaw
    ? await loadCertificateMailSentHistory(
        adminSupabase,
        String(resolvedCertRaw.id),
        {
          mail_sent_at: toIsoString((resolvedCertRaw as CertRow).mail_sent_at),
          last_resend_at: toIsoString((resolvedCertRaw as CertRow).last_resend_at),
          mail_sent_history: (resolvedCertRaw as CertRow).mail_sent_history,
        },
        REACH_MAIL_LOG_ACTIONS
      )
    : [];

  const mailRecipients = client.email
    ? buildCertificateRecipients({
        primaryEmail: client.email,
        contactEmails,
        defaultCcEmails: adminSettings?.rc_smtp_cc_default,
        senderEmail: adminSettings?.rc_smtp_from,
      })
    : null;

  const defaultYearPeriod = getDefaultReachPeriodForYear(new Date().getFullYear());
  const defaults = {
    registrationNumber:
      resolvedCert?.registration_number?.trim() ||
      clientChem?.registration_number?.trim() ||
      '',
    issuedDate: resolvedCert?.issued_at
      ? toDateOnly(resolvedCert.issued_at)
      : toDateOnly(clientChem?.issued_date) || defaultYearPeriod.issuedDate,
    validatedDate:
      toDateOnly(resolvedCert?.expires_at) ||
      toDateOnly(clientChem?.validity_date) ||
      defaultYearPeriod.validatedDate,
    tonnageBand: (resolvedCertRaw as CertRow | null)?.tonnage_band || chemical.tonnage_band || '',
  };

  const templateSettings = await getActiveTemplate(adminSupabase);
  const rcBranding = resolveRcBranding(templateSettings);

  return (
    <ReachCertificatePreviewClient
      clientId={clientId}
      chemicalId={chemicalId}
      client={{
        company_name: client.company_name,
        email: client.email,
        uuid_number: client.uuid_number,
        address: client.address,
        city: client.city,
        state: client.state,
        postal_code: client.postal_code,
        country: client.country,
      }}
      chemical={{
        chemical_name: chemical.chemical_name,
        cas_number: chemical.cas_number,
        ec_number: chemical.ec_number,
        tonnage_band: chemical.tonnage_band,
      }}
      cert={resolvedCert}
      defaults={defaults}
      mailRecipients={mailRecipients}
      mailSentHistory={mailSentHistory}
      branding={{
        accentColor: rcBranding.accent_color,
        logoUrl: rcBranding.logo,
        signatureUrl: rcBranding.signature_image,
        footerText: rcBranding.footer_text,
      }}
    />
  );
}
