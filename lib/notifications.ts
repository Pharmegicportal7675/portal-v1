import type { DbClient } from '@/lib/db/types';

export type NotificationRow = {
  id: string;
  title: string;
  message: string;
  link?: string | null;
  read: boolean;
  created_at: string;
};

export const NEW_TCC_APPLICATION_TITLE = 'New TCC application';

export function formatNotificationQuantity(value: unknown): string {
  const raw = value == null ? '' : String(value).trim();
  const numeric = Number(raw);
  if (!raw || !Number.isFinite(numeric)) return raw || '0';
  return String(numeric);
}

export function newTccApplicationMessage(
  companyName: string,
  quantity: unknown,
  chemicalName: string
) {
  const company = companyName.trim() || 'A client';
  return `${company} submitted ${formatNotificationQuantity(quantity)} MT for ${chemicalName}. Review in Approvals.`;
}

export function newTccApplicationLink(applicationId: string) {
  return `/admin/approvals?app=${encodeURIComponent(applicationId)}`;
}

export async function notifyUser(
  supabase: DbClient,
  userId: string,
  title: string,
  message: string,
  link?: string | null
) {
  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    title,
    message,
    link: link?.trim() || null,
    read: false,
  });
  if (error) throw error;
}

export async function notifyAllAdmins(
  supabase: DbClient,
  title: string,
  message: string,
  link?: string | null
) {
  const { data: admins, error: fetchErr } = await supabase
    .from('users')
    .select('id')
    .in('role', ['MASTER_ADMIN', 'SUPER_ADMIN']);

  if (fetchErr) throw fetchErr;
  if (!admins?.length) return;

  const rows = admins.map((a: any) => ({
    user_id: a.id,
    title,
    message,
    link: link?.trim() || null,
    read: false,
  }));

  const { error } = await supabase.from('notifications').insert(rows);
  if (error) throw error;
}
