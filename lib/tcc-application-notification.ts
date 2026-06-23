import type { SupabaseClient } from '@supabase/supabase-js';
import { buildTccSmtpConfig } from '@/lib/certificate-smtp-settings';
import { parseEmailList } from '@/lib/certificate-email-recipients';
import { sendTccApplicationNotificationEmail } from '@/services/email';

export type TccApplicationNotificationDetails = {
  clientCompanyName: string;
  chemicalName?: string | null;
  casNumber?: string | null;
  ecNumber?: string | null;
  caseNumber?: string | null;
  quantityMt: number;
  exportDate: string;
  applicationId?: string | null;
  regulatoryFramework: string;
  euImporterCompanyName?: string | null;
  euImporterAddress?: string | null;
  purchaseOrderNumber?: string | null;
  currentAvailableMt?: number | null;
  projectedBalanceMt?: number | null;
  rcCertificateNumber?: string | null;
  rcPeriodStart?: string | null;
  rcPeriodEnd?: string | null;
  poAttachment?: {
    buffer: Buffer;
    fileName: string;
    contentType: string;
  } | null;
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateTccNotificationEmails(raw?: string | null): string | null {
  const emails = parseEmailList(raw);
  for (const email of emails) {
    if (!isValidEmail(email)) {
      return `Invalid notification email: ${email}`;
    }
  }
  return null;
}

export async function notifyTccApplicationByEmail(
  adminSupabase: SupabaseClient,
  details: TccApplicationNotificationDetails
): Promise<void> {
  const [{ data: settings }, { data: template }] = await Promise.all([
    adminSupabase
      .from('admin_settings')
      .select(
        'tcc_application_notification_emails, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from'
      )
      .eq('id', 1)
      .maybeSingle(),
    adminSupabase.from('templates').select('logo').limit(1).maybeSingle(),
  ]);

  const recipients = parseEmailList(settings?.tcc_application_notification_emails);
  if (recipients.length === 0) return;

  await sendTccApplicationNotificationEmail({
    to: recipients,
    smtpConfig: buildTccSmtpConfig(settings),
    logoUrl: template?.logo ?? null,
    ...details,
  });
}
