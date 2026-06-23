'use client';

import { X } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { DatePicker } from './DatePicker';

export interface DateRangeValue {
  from: string;
  to: string;
}

interface TableDateRangeFilterProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  className?: string;
}

export function TableDateRangeFilter({ value, onChange, className }: TableDateRangeFilterProps) {
  const isActive = Boolean(value.from.trim() || value.to.trim());

  const clear = () => onChange({ from: '', to: '' });

  return (
    <div className={twMerge('relative mt-1.5 space-y-1', className)}>
      <DatePicker
        value={value.from}
        onChange={(from) => onChange({ ...value, from })}
        size="compact"
        clearable
        placeholder="From"
        aria-label="From date"
        className={isActive ? 'border-primary/60 bg-primary/5' : undefined}
      />
      <DatePicker
        value={value.to}
        onChange={(to) => onChange({ ...value, to })}
        size="compact"
        clearable
        placeholder="To"
        min={value.from || undefined}
        aria-label="To date"
        className={isActive ? 'border-primary/60 bg-primary/5' : undefined}
      />
      {isActive && (
        <button
          type="button"
          onClick={clear}
          className="absolute -right-0.5 top-0 p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          title="Clear date range"
          aria-label="Clear date range"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
