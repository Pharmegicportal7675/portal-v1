import type { DbClient } from '@/lib/db/types';
import { buildCertificateRecipients } from '@/lib/certificate-email-recipients';
import { appendMailSentHistory } from '@/lib/certificate-mail-history';
import { buildTccSmtpConfig } from '@/lib/certificate-smtp-settings';
import {
  buildTccCertificatePdfInputFromStoredCert,
  resolveTccCertificateDownloadFile,
} from '@/lib/tcc-certificate-pdf';
import { sendCertificateEmail as sendCertEmail } from '@/services/email';

const TCC_CERT_EMAIL_SELECT = `
  *,
  chemicals (chemical_name, cas_number, ec_number, tonnage_band),
  tcc_applications!certificates_tcc_application_id_fkey (
    id, quantity_mt, registration_number, export_date, tracking_id, remarks,
    eu_importer_company_name, eu_importer_address, purchase_order_number, invoice_number,
    chemicals (chemical_name, cas_number, ec_number, tonnage_band)
  ),
  clients (
    id, company_name, email, cc_emails, uuid_number, address, city, state, postal_code, country,
    client_contacts (email)
  )
`;

type TccCertEmailRow = {
  id: string;
  certificate_number: string;
  client_id: string;
  mail_sent?: boolean | null;
  mail_resend_count?: number | null;
  mail_sent_history?: unknown;
  clients: {
    company_name: string;
    email: string;
    client_contacts?: { email: string }[] | null;
  };
  tcc_applications?: {
    chemicals?: { chemical_name?: string | null } | { chemical_name?: string | null }[] | null;
  } | null;
};

async function loadTccCertificateForEmail(
  supabase: DbClient,
  certificateId: string
): Promise<TccCertEmailRow> {
  const { data: cert, error } = await supabase
    .from('certificates')
    .select(TCC_CERT_EMAIL_SELECT)
    .eq('id', certificateId)
    .eq('type', 'TCC')
    .single();

  if (error || !cert) {
    throw new Error('Certificate not found');
  }

  return cert as TccCertEmailRow;
}

async function loadTccSmtpSettings(supabase: DbClient) {
  const { data: settings } = await supabase
    .from('admin_settings')
    .select('smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, smtp_cc_default')
    .eq('id', 1)
    .single();
  return settings;
}

function resolveTccCertChemicalName(cert: TccCertEmailRow): string {
  const app = cert.tcc_applications;
  const chemicals = app?.chemicals;
  if (!chemicals) return 'N/A';
  const row = Array.isArray(chemicals) ? chemicals[0] : chemicals;
  return row?.chemical_name?.trim() || 'N/A';
}

export type SendTccCertificateEmailResult =
  | { success: true; recipientEmail: string; skipped?: boolean }
  | { success: false; error: string };

/** First TCC certificate email to the client (approval auto-send or manual Send Mail). */
export async function sendTccCertificateEmailFirst(
  supabase: DbClient,
  certificateId: string,
  sentByUserId: string,
  options?: {
    skipIfAlreadySent?: boolean;
    activityDescription?: string;
  }
): Promise<SendTccCertificateEmailResult> {
  try {
    const cert = await loadTccCertificateForEmail(supabase, certificateId);

    if (options?.skipIfAlreadySent && cert.mail_sent) {
      return { success: true, recipientEmail: cert.clients.email, skipped: true };
    }

    if (cert.mail_sent) {
      return { success: false, error: 'Certificate email was already sent. Use Resend Mail.' };
    }

    const settings = await loadTccSmtpSettings(supabase);
    const contactEmails =
      cert.clients.client_contacts?.map((c) => c.email).filter(Boolean) || [];

    const recipients = buildCertificateRecipients({
      primaryEmail: cert.clients.email,
      contactEmails,
      defaultCcEmails: settings?.smtp_cc_default,
      senderEmail: settings?.smtp_from,
    });

    const pdfInput = await buildTccCertificatePdfInputFromStoredCert(supabase, cert as never);
    const certFile = await resolveTccCertificateDownloadFile(supabase, pdfInput);

    await sendCertEmail({
      to: recipients.to,
      cc: recipients.cc,
      subject: `TCC Certificate Approved — ${cert.certificate_number}`,
      certificateNumber: cert.certificate_number,
      companyName: cert.clients.company_name,
      chemicalName: resolveTccCertChemicalName(cert),
      pdfBuffer: certFile.buffer,
      pdfFileName: certFile.fileName,
      attachmentContentType: certFile.contentType,
      smtpConfig: buildTccSmtpConfig(settings),
    });

    const now = new Date().toISOString();
    await supabase
      .from('certificates')
      .update({
        mail_sent: true,
        mail_sent_at: now,
        mail_sent_by: sentByUserId,
        mail_sent_history: [now],
      })
      .eq('id', certificateId);

    await supabase.from('activity_logs').insert({
      client_id: cert.client_id,
      user_id: sentByUserId,
      action: 'CERTIFICATE_EMAIL_SENT',
      entity_type: 'certificates',
      entity_id: certificateId,
      description:
        options?.activityDescription ||
        `Certificate email sent to ${cert.clients.email}`,
    });

    return { success: true, recipientEmail: cert.clients.email };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[TCC CERT EMAIL] First send failed:', err);
    return { success: false, error: message };
  }
}

/** Resend TCC certificate email (manual button after the first send). */
export async function resendTccCertificateEmail(
  supabase: DbClient,
  certificateId: string,
  sentByUserId: string
): Promise<SendTccCertificateEmailResult> {
  try {
    const cert = await loadTccCertificateForEmail(supabase, certificateId);

    if (!cert.mail_sent) {
      return {
        success: false,
        error: 'Certificate has not been sent yet. Use Send Mail To Client first.',
      };
    }

    const settings = await loadTccSmtpSettings(supabase);
    const contactEmails =
      cert.clients.client_contacts?.map((c) => c.email).filter(Boolean) || [];

    const recipients = buildCertificateRecipients({
      primaryEmail: cert.clients.email,
      contactEmails,
      defaultCcEmails: settings?.smtp_cc_default,
      senderEmail: settings?.smtp_from,
    });

    const pdfInput = await buildTccCertificatePdfInputFromStoredCert(supabase, cert as never);
    const certFile = await resolveTccCertificateDownloadFile(supabase, pdfInput);

    await sendCertEmail({
      to: recipients.to,
      cc: recipients.cc,
      subject: `TCC Certificate (Resent) — ${cert.certificate_number}`,
      certificateNumber: cert.certificate_number,
      companyName: cert.clients.company_name,
      chemicalName: resolveTccCertChemicalName(cert),
      pdfBuffer: certFile.buffer,
      pdfFileName: certFile.fileName,
      attachmentContentType: certFile.contentType,
      smtpConfig: buildTccSmtpConfig(settings),
    });

    const now = new Date().toISOString();
    await supabase
      .from('certificates')
      .update({
        mail_resend_count: (cert.mail_resend_count || 0) + 1,
        last_resend_at: now,
        last_resend_by: sentByUserId,
        mail_sent_history: appendMailSentHistory(cert.mail_sent_history, now),
      })
      .eq('id', certificateId);

    await supabase.from('activity_logs').insert({
      client_id: cert.client_id,
      user_id: sentByUserId,
      action: 'CERTIFICATE_EMAIL_RESENT',
      entity_type: 'certificates',
      entity_id: certificateId,
      description: `Certificate email resent (${(cert.mail_resend_count || 0) + 1}x)`,
    });

    return { success: true, recipientEmail: cert.clients.email };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[TCC CERT EMAIL] Resend failed:', err);
    return { success: false, error: message };
  }
}
