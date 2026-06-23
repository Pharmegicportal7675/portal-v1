export default function ClientDashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse pb-12">
      <div className="h-8 w-64 rounded-lg bg-slate-200" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="h-[120px] rounded-xl bg-slate-200 lg:col-span-1" />
        <div className="min-h-[360px] rounded-xl bg-slate-200 lg:col-span-3" />
      </div>
      <div className="h-96 rounded-xl bg-slate-200" />
    </div>
  );
}
