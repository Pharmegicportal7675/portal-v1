'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';

export async function markNotificationReadAction(notificationId: string) {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId)
    .eq('user_id', session.userId);

  if (error) return { success: false, error: error.message };

  revalidatePath('/admin', 'layout');
  revalidatePath('/client', 'layout');
  return { success: true };
}

export async function markAllNotificationsReadAction() {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', session.userId)
    .eq('read', false);

  if (error) return { success: false, error: error.message };

  revalidatePath('/admin', 'layout');
  revalidatePath('/client', 'layout');
  return { success: true };
}
