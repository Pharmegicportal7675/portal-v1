'use client';

import { useLayoutStore } from '@/store/layout';
import { logout } from '@/actions/auth';
import { LogOut, Menu, User } from 'lucide-react';
import NotificationBell from './NotificationBell';
import type { NotificationRow } from '@/lib/notifications';
import { useRouter } from 'next/navigation';
import { Badge } from './ui/Badge';
import Breadcrumbs from './Breadcrumbs';

interface TopNavbarProps {
  userEmail: string;
  role: 'SUPER_ADMIN' | 'MASTER_ADMIN' | 'CLIENT';
  notificationCount?: number;
  notifications?: NotificationRow[];
}

export default function TopNavbar({
  userEmail,
  role,
  notificationCount = 0,
  notifications = [],
}: TopNavbarProps) {
  const { toggleSidebar } = useLayoutStore();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      router.replace('/login');
      router.refresh();
    }
  };

  const getRoleLabel = (r: string) => {
    if (r === 'SUPER_ADMIN') return 'Super Admin';
    if (r === 'MASTER_ADMIN') return 'Master Admin';
    return 'Client Representative';
  };

  const getRoleBadgeVariant = (r: string) => {
    if (r === 'SUPER_ADMIN') return 'danger';
    if (r === 'MASTER_ADMIN') return 'warning';
    return 'success';
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 sm:h-16 w-full min-w-0 items-center justify-between gap-2 border-b border-slate-100 bg-white px-3 sm:px-6 shadow-xs">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
        <button
          onClick={toggleSidebar}
          className="md:hidden shrink-0 p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg cursor-pointer"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="hidden min-w-0 sm:block">
          <Breadcrumbs />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        <NotificationBell
          initialNotifications={notifications}
          unreadCount={notificationCount}
          role={role}
        />

        <div className="hidden sm:flex items-center gap-3 border-l border-slate-100 pl-4">
          <div className="flex flex-col items-end min-w-0">
            <span className="text-xs font-semibold text-slate-800 max-w-[180px] truncate">
              {userEmail}
            </span>
            <Badge variant={getRoleBadgeVariant(role)} className="text-[10px] px-2 py-0">
              {getRoleLabel(role)}
            </Badge>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 shrink-0">
            <User className="h-5 w-5" />
          </div>
        </div>

        <div className="flex sm:hidden h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 shrink-0">
          <User className="h-5 w-5" />
        </div>

        <button
          type="button"
          onClick={handleLogout}
          title="Sign out of portal"
          aria-label="Log out"
          className="inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all px-2.5 py-2 sm:px-4 sm:py-2.5 bg-accent text-accent-foreground shadow-xs hover:bg-accent-hover cursor-pointer shrink-0"
        >
          <LogOut className="h-4 w-4 sm:hidden" />
          <span className="hidden sm:inline">Log Out</span>
        </button>
      </div>
    </header>
  );
}
