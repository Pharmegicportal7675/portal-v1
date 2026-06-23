'use client';

import { Scale, X } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface NumberRangeValue {
  min: string;
  max: string;
}

interface TableNumberRangeFilterProps {
  value: NumberRangeValue;
  onChange: (value: NumberRangeValue) => void;
  unit?: string;
  className?: string;
}

export function TableNumberRangeFilter({
  value,
  onChange,
  unit = 'MT',
  className,
}: TableNumberRangeFilterProps) {
  const isActive = Boolean(value.min.trim() || value.max.trim());

  const inputClass = twMerge(
    'w-full h-7 rounded-md border text-[10px] font-medium px-1.5',
    'bg-white text-slate-700 placeholder:text-slate-400',
    'focus:outline-hidden focus:ring-2 focus:ring-primary/30 focus:border-primary',
    isActive ? 'border-primary/60 bg-primary/5' : 'border-slate-200'
  );

  const clear = () => onChange({ min: '', max: '' });

  return (
    <div className={twMerge('relative mt-1.5 space-y-1', className)}>
      <div className="relative">
        {!isActive && (
          <Scale className="h-3 w-3 text-slate-400 absolute left-1.5 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
        )}
        <input
          type="number"
          step="0.01"
          min="0"
          value={value.min}
          onChange={(e) => onChange({ ...value, min: e.target.value })}
          placeholder={`Min ${unit}`}
          className={clsx(inputClass, !isActive && 'pl-6', isActive && 'pr-6')}
          aria-label={`Minimum ${unit}`}
        />
      </div>
      <input
        type="number"
        step="0.01"
        min={value.min || '0'}
        value={value.max}
        onChange={(e) => onChange({ ...value, max: e.target.value })}
        placeholder={`Max ${unit}`}
        className={clsx(inputClass, isActive && 'pr-6')}
        aria-label={`Maximum ${unit}`}
      />
      {isActive && (
        <button
          type="button"
          onClick={clear}
          className="absolute -right-0.5 top-0 p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          title="Clear range"
          aria-label="Clear range"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
