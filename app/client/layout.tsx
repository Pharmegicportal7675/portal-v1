import { Suspense } from 'react';
import { ClientLayoutContent } from '@/app/client/ClientLayoutContent';
import { AdminLayoutSkeleton } from '@/components/layout/AdminLayoutSkeleton';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<AdminLayoutSkeleton />}>
      <ClientLayoutContent>{children}</ClientLayoutContent>
    </Suspense>
  );
}
