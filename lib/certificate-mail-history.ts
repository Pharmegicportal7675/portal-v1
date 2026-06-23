import type { SupabaseClient } from '@supabase/supabase-js';

export const REACH_MAIL_LOG_ACTIONS = [
  'REACH_CERTIFICATE_EMAIL_SENT',
  'REACH_CERTIFICATE_EMAIL_RESENT',
] as const;

export const TCC_MAIL_LOG_ACTIONS = ['CERTIFICATE_EMAIL_SENT', 'CERTIFICATE_EMAIL_RESENT'] as const;

export function parseMailSentHistory(raw: unknown): string[] {
  if (!raw) return [];
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()));
}

export function appendMailSentHistory(existing: unknown, timestamp: string): string[] {
  return [...parseMailSentHistory(existing), timestamp];
}

export function resolveMailSentHistoryFallback(cert: {
  mail_sent_at?: string | null;
  last_resend_at?: string | null;
  mail_sent_history?: unknown;
}): string[] {
  const stored = parseMailSentHistory(cert.mail_sent_history);
  if (stored.length > 0) return stored;

  const times: string[] = [];
  if (cert.mail_sent_at) times.push(cert.mail_sent_at);
  if (cert.last_resend_at && cert.last_resend_at !== cert.mail_sent_at) {
    times.push(cert.last_resend_at);
  }
  return times;
}

export async function loadCertificateMailSentHistory(
  supabase: SupabaseClient,
  certificateId: string,
  cert: {
    mail_sent_at?: string | null;
    last_resend_at?: string | null;
    mail_sent_history?: unknown;
  },
  actions: readonly string[]
): Promise<string[]> {
  const stored = parseMailSentHistory(cert.mail_sent_history);
  if (stored.length > 0) return stored;

  const { data: logs } = await supabase
    .from('activity_logs')
    .select('created_at')
    .eq('entity_id', certificateId)
    .in('action', [...actions])
    .order('created_at', { ascending: true });

  if (logs && logs.length > 0) {
    return logs.map((log) => log.created_at).filter(Boolean);
  }

  return resolveMailSentHistoryFallback(cert);
}
