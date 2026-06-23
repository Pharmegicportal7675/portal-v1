export default function AdminLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center min-h-[300px]">
      <div className="flex flex-col items-center gap-4">
        {/* Loading Spinner */}
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-primary" />
        <p className="text-xs font-semibold text-slate-500 tracking-wider uppercase animate-pulse">
          Loading Compliance Data...
        </p>
      </div>
    </div>
  );
}
