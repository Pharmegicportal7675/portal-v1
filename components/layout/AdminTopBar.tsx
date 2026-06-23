import TopNavbar from '@/components/TopNavbar';
import { createAdminClient } from '@/lib/db/admin';
import type { SessionPayload } from '@/lib/auth/session';

export async function AdminTopBar({ session }: { session: SessionPayload }) {
  const adminSupabase = createAdminClient();
  const [{ count: notificationCount }, { data: notifications }] = await Promise.all([
    adminSupabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', session.userId)
      .eq('read', false),
    adminSupabase
      .from('notifications')
      .select('id, title, message, link, read, created_at')
      .eq('user_id', session.userId)
      .order('created_at', { ascending: false })
      .limit(40),
  ]);

  return (
    <TopNavbar
      userEmail={session.email}
      role={session.role}
      notificationCount={notificationCount || 0}
      notifications={(notifications || []) as Parameters<typeof TopNavbar>[0]['notifications']}
    />
  );
}
