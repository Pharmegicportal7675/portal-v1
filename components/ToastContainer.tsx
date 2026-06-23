'use client';

import { useToastStore, type Toast } from '@/store/toast';
import { X, CheckCircle, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-full max-w-sm">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onClose={() => removeToast(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const { type, message } = toast;

  const bgStyles = {
    success: 'bg-white border-l-4 border-emerald-500 text-slate-800 shadow-lg',
    error: 'bg-white border-l-4 border-rose-500 text-slate-800 shadow-lg',
    warning: 'bg-white border-l-4 border-amber-500 text-slate-800 shadow-lg',
    info: 'bg-white border-l-4 border-sky-500 text-slate-800 shadow-lg',
  };

  const iconMap = {
    success: <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />,
    error: <AlertCircle className="h-5 w-5 text-rose-500 shrink-0" />,
    warning: <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />,
    info: <Info className="h-5 w-5 text-sky-500 shrink-0" />,
  };

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-md shadow-md border border-slate-100 transition-all duration-4300 animate-slide-in ${bgStyles[type]}`}
      role="alert"
    >
      {iconMap[type]}
      <div className="flex-1 text-sm font-medium pr-2">{message}</div>
      <button
        onClick={onClose}
        className="text-slate-400 hover:text-slate-600 transition-colors shrink-0"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
