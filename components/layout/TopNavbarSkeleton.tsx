export function TopNavbarSkeleton() {
  return (
    <header className="h-14 shrink-0 border-b border-slate-200 bg-white px-4 sm:px-6 flex items-center justify-between animate-pulse">
      <div className="h-4 w-32 rounded bg-slate-200" />
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-slate-200" />
        <div className="h-8 w-20 rounded-lg bg-slate-200" />
      </div>
    </header>
  );
}
