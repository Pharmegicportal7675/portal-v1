import * as React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { FormLabel } from './FormLabel';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string; disabled?: boolean }[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, options, required, ...props }, ref) => {
    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && <FormLabel required={required}>{label}</FormLabel>}
        <select
          ref={ref}
          required={required}
          className={twMerge(
            clsx(
              'flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-background placeholder:text-slate-400 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 transition-colors cursor-pointer',
              error ? 'border-rose-500 focus-visible:ring-rose-500' : 'border-slate-200 focus-visible:ring-primary',
              className
            )
          )}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <span className="text-xs font-medium text-rose-500">{error}</span>}
      </div>
    );
  }
);

Select.displayName = 'Select';
