import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/auth/session';
import ReachCertificatePreviewClient from '@/components/ReachCertificatePreviewClient';
import { getLastDateOfYear, getTodayDateString, isReachCertificateType, getDefaultReachPeriodForYear } from '@/lib/reach-certificate';
import { regenerateReachCertificateFile } from '@/actions/reach';
import { buildCertificateRecipients } from '@/lib/certificate-email-recipients';
import { resolveRcBranding } from '@/lib/certificate-template-config';
import { getActiveTemplate } from '@/services/db';
import {
  loadCertificateMailSentHistory,
  REACH_MAIL_LOG_ACTIONS,
} from '@/lib/certificate-mail-history';

export const revalidate = 0;

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
    { data: client },
    { data: chemical },
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
        .eq('status', 'active')
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

  if (!client || !chemical || !clientChem) {
    redirect(`/admin/clients/${clientId}`);
  }

  const certList = Array.isArray(cert) ? cert : cert ? [cert] : [];
  const resolvedCert =
    certList.find((row) => isReachCertificateType(row)) ??
    (requestedCertId && cert && !Array.isArray(cert) && isReachCertificateType(cert) ? cert : null);

  if (resolvedCert) {
    await regenerateReachCertificateFile(resolvedCert.id).catch(() => undefined);
  }

  const contactEmails = (contacts || []).map((c) => c.email).filter(Boolean);
  const mailSentHistory = resolvedCert
    ? await loadCertificateMailSentHistory(adminSupabase, resolvedCert.id, resolvedCert, REACH_MAIL_LOG_ACTIONS)
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
      resolvedCert?.registration_number?.trim() || clientChem.registration_number?.trim() || '',
    issuedDate: resolvedCert?.issued_at
      ? resolvedCert.issued_at.split('T')[0]
      : clientChem.issued_date?.split('T')[0] || defaultYearPeriod.issuedDate,
    validatedDate:
      resolvedCert?.expires_at?.split('T')[0] ||
      clientChem.validity_date?.split('T')[0] ||
      defaultYearPeriod.validatedDate,
    tonnageBand: resolvedCert?.tonnage_band || chemical.tonnage_band || '',
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
      cert={resolvedCert ?? null}
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
