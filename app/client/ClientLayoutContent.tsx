import { Suspense } from 'react';
import Sidebar from '@/components/Sidebar';
import { getSession } from '@/lib/auth/session';
import { redirectToLoginPage, redirectToRoleHome } from '@/lib/auth/redirects';
import { ClientTopBar } from '@/components/layout/ClientTopBar';
import { TopNavbarSkeleton } from '@/components/layout/TopNavbarSkeleton';
import { getClientSidebarProfile } from '@/lib/client-sidebar-profile';

export async function ClientLayoutContent({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  if (!session) {
    redirectToLoginPage(undefined, '/client');
  }
  if (session.role !== 'CLIENT') {
    redirectToRoleHome(session.role);
  }

  const profile = session.clientId ? await getClientSidebarProfile(session.clientId) : null;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50" suppressHydrationWarning>
      <Sidebar
        role={session.role}
        companyName={profile?.companyName ?? 'Partner Client'}
        regulatoryRegistrations={profile?.regulatoryRegistrations ?? []}
      />
      <div className="flex min-w-0 flex-1 flex-col h-full overflow-hidden">
        <Suspense fallback={<TopNavbarSkeleton />}>
          <ClientTopBar session={session} />
        </Suspense>
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
