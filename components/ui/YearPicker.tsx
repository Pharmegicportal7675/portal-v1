'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { Calendar, X } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { FormLabel } from './FormLabel';

export interface YearPickerProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  label?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  error?: string;
  className?: string;
  id?: string;
  name?: string;
}

export const YearPicker = React.forwardRef<HTMLButtonElement, YearPickerProps>(
  (
    {
      value,
      onChange,
      options,
      label,
      required,
      disabled,
      placeholder = 'Select Year',
      error,
      className,
      id,
      name,
    },
    ref
  ) => {
    const [open, setOpen] = React.useState(false);
    const [mounted, setMounted] = React.useState(false);
    const [position, setPosition] = React.useState({ top: 0, left: 0, width: 0 });
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    const dropdownRef = React.useRef<HTMLDivElement>(null);

    React.useImperativeHandle(ref, () => triggerRef.current as HTMLButtonElement);

    React.useEffect(() => {
      setMounted(true);
    }, []);

    const updatePosition = React.useCallback(() => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dropdownHeight = 180;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top =
        spaceBelow >= dropdownHeight ? rect.bottom + 6 : Math.max(8, rect.top - dropdownHeight - 6);
      setPosition({
        top,
        left: Math.min(rect.left, window.innerWidth - 200 - 8),
        width: rect.width,
      });
    }, []);

    const openDropdown = () => {
      if (disabled) return;
      setOpen(true);
      requestAnimationFrame(updatePosition);
    };

    React.useEffect(() => {
      if (!open) return;
      updatePosition();
      const onScrollOrResize = () => updatePosition();
      window.addEventListener('resize', onScrollOrResize);
      window.addEventListener('scroll', onScrollOrResize, true);
      return () => {
        window.removeEventListener('resize', onScrollOrResize);
        window.removeEventListener('scroll', onScrollOrResize, true);
      };
    }, [open, updatePosition]);

    React.useEffect(() => {
      if (!open) return;
      const onPointerDown = (event: MouseEvent) => {
        const target = event.target as Node;
        if (triggerRef.current?.contains(target)) return;
        if (dropdownRef.current?.contains(target)) return;
        setOpen(false);
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

    const displayValue = options.find((opt) => opt.value === value)?.label || value || '';

    const triggerClass = twMerge(
      clsx(
        'flex w-full items-center justify-between rounded-md border bg-white text-left ring-offset-background transition-colors h-10 px-3 py-2 text-sm',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-slate-300',
        error
          ? 'border-rose-500 focus-visible:ring-rose-500'
          : open
            ? 'border-primary ring-2 ring-primary/30'
            : 'border-slate-200 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
        className
      )
    );

    const dropdown = open && mounted
      ? createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[10050] rounded-xl border border-slate-200 bg-white shadow-xl p-3 w-[200px] max-h-[220px] overflow-y-auto"
            style={{ top: position.top, left: position.left, minWidth: Math.max(position.width, 200) }}
            role="dialog"
            aria-label="Choose Year"
          >
            <div className="grid grid-cols-2 gap-1.5">
              {options.map((opt) => {
                const isSelected = value === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={twMerge(
                      'rounded-md py-2 px-1 text-xs font-semibold transition-colors text-center border cursor-pointer',
                      isSelected
                        ? 'bg-primary text-white border-primary shadow-xs'
                        : 'text-slate-700 bg-white border-slate-100 hover:bg-slate-50 hover:border-slate-200'
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {options.length === 0 && (
              <div className="text-center text-xs text-slate-400 py-4 font-semibold">
                No years available
              </div>
            )}
          </div>,
          document.body
        )
      : null;

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && <FormLabel required={required}>{label}</FormLabel>}
        <div className="relative">
          <button
            ref={triggerRef}
            id={id}
            type="button"
            disabled={disabled}
            aria-label={label || 'Select Year'}
            aria-expanded={open}
            aria-haspopup="dialog"
            onClick={() => (open ? setOpen(false) : openDropdown())}
            className={triggerClass}
          >
            <span className={clsx('truncate', !displayValue && 'text-slate-400')}>
              {displayValue || placeholder}
            </span>
            <Calendar className="shrink-0 text-slate-400 h-4 w-4" />
          </button>
          {name && <input type="hidden" name={name} value={value} />}
        </div>
        {error && <span className="text-xs font-medium text-rose-500">{error}</span>}
        {dropdown}
      </div>
    );
  }
);

YearPicker.displayName = 'YearPicker';
