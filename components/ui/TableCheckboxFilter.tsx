'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Filter, X } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

type CheckboxFilterOption = {
  value: string;
  label: string;
};

interface TableCheckboxFilterProps {
  values: string[];
  onChange: (values: string[]) => void;
  options: CheckboxFilterOption[];
  placeholder?: string;
  className?: string;
}

export function TableCheckboxFilter({
  values,
  onChange,
  options,
  placeholder = 'All',
  className,
}: TableCheckboxFilterProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = new Set(values);
  const isActive = values.length > 0;

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const toggleValue = (value: string) => {
    if (selected.has(value)) {
      onChange(values.filter((item) => item !== value));
      return;
    }
    onChange([...values, value].sort((a, b) => Number(b) - Number(a) || a.localeCompare(b)));
  };

  const summary = isActive
    ? values.length <= 2
      ? values.join(', ')
      : `${values.length} selected`
    : placeholder;

  return (
    <div ref={rootRef} className={twMerge('relative mt-1.5', className)}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={listId}
        className={clsx(
          'w-full min-w-0 h-8 rounded-md border text-[11px] font-medium transition-colors',
          'bg-white text-left text-slate-700',
          'focus:outline-hidden focus:ring-2 focus:ring-primary/30 focus:border-primary',
          'flex items-center gap-1.5 pl-7 pr-7',
          isActive ? 'border-primary/60 bg-primary/5 text-slate-800' : 'border-slate-200'
        )}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown
          className={clsx(
            'absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>

      {!isActive && (
        <Filter className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
      )}

      {isActive && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onChange([]);
          }}
          className="absolute right-5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          title="Clear filter"
          aria-label="Clear filter"
        >
          <X className="h-3 w-3" />
        </button>
      )}

      {open && (
        <div
          id={listId}
          className="absolute left-0 top-[calc(100%+4px)] z-30 min-w-[140px] w-full rounded-md border border-slate-200 bg-white shadow-lg py-1.5"
          role="listbox"
          aria-multiselectable="true"
        >
          {options.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-slate-400">No years available</p>
          ) : (
            <div className="max-h-48 overflow-y-auto">
              {options.map((option) => {
                const checked = selected.has(option.value);
                return (
                  <label
                    key={option.value}
                    className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleValue(option.value)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                    />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
