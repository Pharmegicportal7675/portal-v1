import type { NotificationRow } from '@/lib/notifications';

export function resolveNotificationLink(
  notification: NotificationRow,
  role?: 'SUPER_ADMIN' | 'MASTER_ADMIN' | 'CLIENT'
): string | null {
  if (notification.link?.trim()) {
    return notification.link.trim();
  }

  const title = notification.title.toLowerCase();
  const message = notification.message.toLowerCase();
  const isAdmin = role === 'MASTER_ADMIN' || role === 'SUPER_ADMIN';

  if (title.includes('new tcc application') || message.includes('review in approvals')) {
    return isAdmin ? '/admin/approvals' : '/client';
  }

  if (title.includes('uk reach') || title.includes('turkey') || title.includes('kkdik')) {
    return isAdmin ? '/admin/rc-certificates' : '/client';
  }

  if (title.includes('tcc certificate issued')) {
    return '/client/certificates';
  }

  if (
    title.includes('tcc application rejected') ||
    title.includes('tcc changes required') ||
    title.includes('modification')
  ) {
    return '/client';
  }

  if (title.includes('rc compliance certificate') || title.includes('rc certificate')) {
    return '/client';
  }

  return isAdmin ? '/admin' : '/client';
}
