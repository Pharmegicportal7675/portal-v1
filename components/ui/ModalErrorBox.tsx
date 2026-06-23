import { AlertCircle } from 'lucide-react';

interface ModalErrorBoxProps {
  message: string | null;
  title?: string;
}

export function ModalErrorBox({ message, title = 'Error' }: ModalErrorBoxProps) {
  if (!message) return null;

  return (
    <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm font-semibold flex items-start gap-2.5">
      <AlertCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <h4 className="font-bold mb-1">{title}</h4>
        <p className="text-xs leading-relaxed font-medium break-words">{message}</p>
      </div>
    </div>
  );
}
