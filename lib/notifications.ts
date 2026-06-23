import type { DbClient } from '@/lib/db/types';

export type NotificationRow = {
  id: string;
  title: string;
  message: string;
  link?: string | null;
  read: boolean;
  created_at: string;
};

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
