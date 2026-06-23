import { Suspense } from 'react';
import Sidebar from '@/components/Sidebar';
import { getSession } from '@/lib/auth/session';
import { redirectToLoginPage, redirectToRoleHome } from '@/lib/auth/redirects';
import { AdminTopBar } from '@/components/layout/AdminTopBar';
import { TopNavbarSkeleton } from '@/components/layout/TopNavbarSkeleton';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  if (!session) {
    redirectToLoginPage(undefined, '/admin');
  }

  if (session.role !== 'MASTER_ADMIN' && session.role !== 'SUPER_ADMIN') {
    redirectToRoleHome(session.role);
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50" suppressHydrationWarning>
      <Sidebar role={session.role} />
      <div className="flex min-w-0 flex-1 flex-col h-full overflow-hidden">
        <Suspense fallback={<TopNavbarSkeleton />}>
          <AdminTopBar session={session} />
        </Suspense>
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
