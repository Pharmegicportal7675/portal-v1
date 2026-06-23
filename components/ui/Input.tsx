import * as React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { FormLabel } from './FormLabel';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', label, error, required, ...props }, ref) => {
    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && <FormLabel required={required}>{label}</FormLabel>}
        <input
          type={type}
          ref={ref}
          required={required}
          className={twMerge(
            clsx(
              'flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-400 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
              error ? 'border-rose-500 focus-visible:ring-rose-500' : 'border-slate-200 focus-visible:ring-primary',
              className
            )
          )}
          {...props}
        />
        {error && <span className="text-xs font-medium text-rose-500">{error}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';
