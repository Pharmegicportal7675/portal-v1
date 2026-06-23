import { TopNavbarSkeleton } from '@/components/layout/TopNavbarSkeleton';

export function AdminLayoutSkeleton({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50">
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white md:block animate-pulse">
        <div className="h-16 border-b border-slate-100 px-6 flex items-center">
          <div className="h-8 w-32 rounded bg-slate-200" />
        </div>
        <div className="space-y-2 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 rounded-lg bg-slate-100" />
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col h-full overflow-hidden">
        <TopNavbarSkeleton />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
