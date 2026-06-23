import { clsx } from 'clsx';

interface ResponsiveTableScrollProps {
  children: React.ReactNode;
  className?: string;
}

export function ResponsiveTableScroll({ children, className }: ResponsiveTableScrollProps) {
  return (
    <div
      className={clsx(
        'overflow-x-auto -mx-4 px-4 sm:-mx-6 sm:px-6 md:mx-0 md:px-0',
        '[scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300',
        className
      )}
    >
      {children}
    </div>
  );
}
