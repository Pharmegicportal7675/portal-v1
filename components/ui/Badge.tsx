import * as React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}

export function Badge({ className, variant = 'neutral', ...props }: BadgeProps) {
  const baseStyles = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-hidden';
  
  const variants = {
    primary: 'bg-primary/10 text-primary hover:bg-primary/20',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    outline: 'border border-slate-200 text-slate-800 bg-white hover:bg-slate-50',
    success: 'bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-100/50',
    warning: 'bg-amber-50 text-amber-700 border border-amber-100 hover:bg-amber-100/50',
    danger: 'bg-rose-50 text-rose-700 border border-rose-100 hover:bg-rose-100/50',
    info: 'bg-sky-50 text-sky-700 border border-sky-100 hover:bg-sky-100/50',
    neutral: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
  };

  return (
    <span
      className={twMerge(clsx(baseStyles, variants[variant], className))}
      {...props}
    />
  );
}
