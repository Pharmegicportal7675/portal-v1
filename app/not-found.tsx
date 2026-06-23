import Link from 'next/link';
import { FileQuestion, Home, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
          <FileQuestion className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Page not found</h1>
          <p className="text-sm text-slate-500 font-medium">
            The page you are looking for does not exist or may have been moved.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg transition-colors"
          >
            <Home className="h-4 w-4" />
            Admin Dashboard
          </Link>
          <Link
            href="/admin/clients"
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            All Clients
          </Link>
        </div>
      </div>
    </div>
  );
}
