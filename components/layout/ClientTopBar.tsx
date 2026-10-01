import TopNavbar from '@/components/TopNavbar';
import { getUserNotificationFeed } from '@/lib/notification-feed';
import type { SessionPayload } from '@/lib/auth/session';

export async function ClientTopBar({ session }: { session: SessionPayload }) {
  const { notifications, unreadCount } = await getUserNotificationFeed(session.userId);

  return (
    <TopNavbar
      userEmail={session.email}
      role={session.role}
      notificationCount={unreadCount}
      notifications={notifications}
    />
  );
}
