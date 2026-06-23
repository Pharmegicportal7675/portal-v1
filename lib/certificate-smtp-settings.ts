import type { SmtpConfig } from '@/services/email';

export type AdminSmtpSettingsRow = {
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_user?: string | null;
  smtp_pass?: string | null;
  smtp_from?: string | null;
  smtp_cc_default?: string | null;
  rc_smtp_host?: string | null;
  rc_smtp_port?: number | null;
  rc_smtp_user?: string | null;
  rc_smtp_pass?: string | null;
  rc_smtp_from?: string | null;
  rc_smtp_cc_default?: string | null;
};

export type CertificateSmtpFormData = {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  smtp_from: string;
  smtp_cc_default: string;
};

export function buildTccSmtpConfig(row?: AdminSmtpSettingsRow | null): SmtpConfig | undefined {
  if (!row?.smtp_host && !row?.smtp_user) return undefined;
  return {
    smtp_host: row.smtp_host || undefined,
    smtp_port: row.smtp_port ?? undefined,
    smtp_user: row.smtp_user || undefined,
    smtp_pass: row.smtp_pass || undefined,
    smtp_from: row.smtp_from || undefined,
    smtp_cc_default: row.smtp_cc_default || undefined,
  };
}

export function buildRcSmtpConfig(row?: AdminSmtpSettingsRow | null): SmtpConfig | undefined {
  if (!row?.rc_smtp_host && !row?.rc_smtp_user) return undefined;
  return {
    smtp_host: row.rc_smtp_host || undefined,
    smtp_port: row.rc_smtp_port ?? undefined,
    smtp_user: row.rc_smtp_user || undefined,
    smtp_pass: row.rc_smtp_pass || undefined,
    smtp_from: row.rc_smtp_from || undefined,
    smtp_cc_default: row.rc_smtp_cc_default || undefined,
  };
}

export function mapTccSmtpFormFromSettings(row?: AdminSmtpSettingsRow | null): CertificateSmtpFormData {
  return {
    smtp_host: row?.smtp_host || '',
    smtp_port: row?.smtp_port ?? 587,
    smtp_user: row?.smtp_user || '',
    smtp_pass: row?.smtp_pass || '',
    smtp_from: row?.smtp_from || '',
    smtp_cc_default: row?.smtp_cc_default || '',
  };
}

export function mapRcSmtpFormFromSettings(row?: AdminSmtpSettingsRow | null): CertificateSmtpFormData {
  return {
    smtp_host: row?.rc_smtp_host || '',
    smtp_port: row?.rc_smtp_port ?? 587,
    smtp_user: row?.rc_smtp_user || '',
    smtp_pass: row?.rc_smtp_pass || '',
    smtp_from: row?.rc_smtp_from || '',
    smtp_cc_default: row?.rc_smtp_cc_default || '',
  };
}
