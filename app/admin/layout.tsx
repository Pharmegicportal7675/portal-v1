import { Suspense } from 'react';
import { AdminLayoutContent } from '@/app/admin/AdminLayoutContent';
import { AdminLayoutSkeleton } from '@/components/layout/AdminLayoutSkeleton';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<AdminLayoutSkeleton />}>
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </Suspense>
  );
}
