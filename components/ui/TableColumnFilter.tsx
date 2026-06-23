'use client';

import { Filter, X } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

type FilterType = 'text' | 'select';

interface TableColumnFilterProps {
  type?: FilterType;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  options?: { value: string; label: string }[];
  className?: string;
}

export function TableColumnFilter({
  type = 'text',
  value,
  onChange,
  placeholder = 'Filter…',
  options = [],
  className,
}: TableColumnFilterProps) {
  const isActive = type === 'select' ? value !== 'all' && value !== '' : value.trim().length > 0;

  const baseClass = twMerge(
    clsx(
      'w-full min-w-0 h-8 rounded-md border text-[11px] font-medium transition-colors',
      'bg-white text-slate-700 placeholder:text-slate-400',
      'focus:outline-hidden focus:ring-2 focus:ring-primary/30 focus:border-primary',
      isActive ? 'border-primary/60 bg-primary/5 pr-7' : 'border-slate-200',
      className
    )
  );

  return (
    <div className="relative mt-1.5">
      {type === 'select' ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={clsx(baseClass, 'cursor-pointer pl-2 pr-6 appearance-none')}
          aria-label={placeholder}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={clsx(baseClass, 'pl-7 pr-7')}
          aria-label={placeholder}
        />
      )}
      {!isActive && type === 'text' && (
        <Filter className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
      )}
      {isActive && (
        <button
          type="button"
          onClick={() => onChange(type === 'select' ? 'all' : '')}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          title="Clear filter"
          aria-label="Clear filter"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
