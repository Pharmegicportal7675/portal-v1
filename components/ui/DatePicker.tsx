'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { FormLabel } from './FormLabel';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;

const YEAR_START = 1970;
const YEAR_END_OFFSET = 30;

function parseIsoDate(value: string): { y: number; m: number; d: number } | null {
  if (!value?.trim()) return null;
  const part = value.trim().split('T')[0];
  const [y, m, d] = part.split('-').map(Number);
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

function toIsoDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function formatPickerDisplayDate(iso: string): string {
  const parsed = parseIsoDate(iso);
  if (!parsed) return '';
  return `${String(parsed.d).padStart(2, '0')}-${String(parsed.m).padStart(2, '0')}-${parsed.y}`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function getMondayFirstOffset(year: number, month: number): number {
  const day = new Date(year, month - 1, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function getTodayIso(): string {
  const now = new Date();
  return toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function isDateDisabled(iso: string, min?: string, max?: string): boolean {
  if (min && iso < min) return true;
  if (max && iso > max) return true;
  return false;
}

function buildYearOptions(): number[] {
  const end = new Date().getFullYear() + YEAR_END_OFFSET;
  const years: number[] = [];
  for (let y = end; y >= YEAR_START; y -= 1) years.push(y);
  return years;
}

const YEAR_OPTIONS = buildYearOptions();

export interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  placeholder?: string;
  error?: string;
  className?: string;
  id?: string;
  name?: string;
  size?: 'default' | 'compact';
  clearable?: boolean;
  'aria-label'?: string;
}

export const DatePicker = React.forwardRef<HTMLButtonElement, DatePickerProps>(
  (
    {
      value,
      onChange,
      label,
      required,
      disabled,
      min,
      max,
      placeholder = 'DD-MM-YYYY',
      error,
      className,
      id,
      name,
      size = 'default',
      clearable = false,
      'aria-label': ariaLabel,
    },
    ref
  ) => {
    const [open, setOpen] = React.useState(false);
    const [mounted, setMounted] = React.useState(false);
    const [position, setPosition] = React.useState({ top: 0, left: 0, width: 0 });
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    const calendarRef = React.useRef<HTMLDivElement>(null);

    const selected = parseIsoDate(value);
    const todayIso = getTodayIso();

    const [viewYear, setViewYear] = React.useState(() => selected?.y ?? new Date().getFullYear());
    const [viewMonth, setViewMonth] = React.useState(() => selected?.m ?? new Date().getMonth() + 1);

    React.useImperativeHandle(ref, () => triggerRef.current as HTMLButtonElement);

    React.useEffect(() => {
      setMounted(true);
    }, []);

    const updatePosition = React.useCallback(() => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const calendarHeight = size === 'compact' ? 300 : 340;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top =
        spaceBelow >= calendarHeight ? rect.bottom + 6 : Math.max(8, rect.top - calendarHeight - 6);
      setPosition({
        top,
        left: Math.min(rect.left, window.innerWidth - 288 - 8),
        width: rect.width,
      });
    }, [size]);

    const openCalendar = () => {
      if (disabled) return;
      const parsed = parseIsoDate(value);
      if (parsed) {
        setViewYear(parsed.y);
        setViewMonth(parsed.m);
      } else {
        const now = new Date();
        setViewYear(now.getFullYear());
        setViewMonth(now.getMonth() + 1);
      }
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
        if (calendarRef.current?.contains(target)) return;
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

    const goToMonth = (year: number, month: number) => {
      let nextMonth = month;
      let nextYear = year;
      if (nextMonth < 1) {
        nextMonth = 12;
        nextYear -= 1;
      } else if (nextMonth > 12) {
        nextMonth = 1;
        nextYear += 1;
      }
      setViewYear(nextYear);
      setViewMonth(nextMonth);
    };

    const selectDay = (day: number) => {
      const iso = toIsoDate(viewYear, viewMonth, day);
      if (isDateDisabled(iso, min, max)) return;
      onChange(iso);
      setOpen(false);
    };

    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const firstOffset = getMondayFirstOffset(viewYear, viewMonth);
    const dayCells: Array<number | null> = [];
    for (let i = 0; i < firstOffset; i += 1) dayCells.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) dayCells.push(d);

    const isCompact = size === 'compact';
    const displayValue = value ? formatPickerDisplayDate(value) : '';

    const triggerClass = twMerge(
      clsx(
        'flex w-full items-center justify-between rounded-md border bg-white text-left ring-offset-background transition-colors',
        isCompact ? 'h-7 px-2 text-[10px] font-medium' : 'h-10 px-3 py-2 text-sm',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-slate-300',
        error
          ? 'border-rose-500 focus-visible:ring-rose-500'
          : open
            ? 'border-primary ring-2 ring-primary/30'
            : 'border-slate-200 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
        className
      )
    );

    const calendar = open && mounted
      ? createPortal(
          <div
            ref={calendarRef}
            className={twMerge(
              'fixed z-[10050] rounded-xl border border-slate-200 bg-white shadow-xl',
              isCompact ? 'w-[260px] p-3' : 'w-[288px] p-4'
            )}
            style={{ top: position.top, left: position.left, minWidth: Math.max(position.width, isCompact ? 260 : 288) }}
            role="dialog"
            aria-label="Choose date"
          >
            <div className="mb-3 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => goToMonth(viewYear, viewMonth - 1)}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                aria-label="Previous month"
              >
                <ChevronLeft className={isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
              </button>

              <div className="grid flex-1 grid-cols-2 gap-1.5">
                <select
                  value={viewMonth}
                  onChange={(e) => setViewMonth(Number(e.target.value))}
                  className={twMerge(
                    'w-full rounded-md border border-slate-200 bg-slate-50 font-semibold text-slate-800 focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/20',
                    isCompact ? 'h-7 px-1.5 text-[10px]' : 'h-9 px-2 text-xs'
                  )}
                  aria-label="Month"
                >
                  {MONTHS.map((month, index) => (
                    <option key={month} value={index + 1}>
                      {month}
                    </option>
                  ))}
                </select>
                <select
                  value={viewYear}
                  onChange={(e) => setViewYear(Number(e.target.value))}
                  className={twMerge(
                    'w-full rounded-md border border-slate-200 bg-slate-50 font-semibold text-slate-800 focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/20',
                    isCompact ? 'h-7 px-1.5 text-[10px]' : 'h-9 px-2 text-xs'
                  )}
                  aria-label="Year"
                >
                  {YEAR_OPTIONS.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => goToMonth(viewYear, viewMonth + 1)}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                aria-label="Next month"
              >
                <ChevronRight className={isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
              </button>
            </div>

            <div className="mb-1 grid grid-cols-7 gap-0.5">
              {WEEKDAYS.map((day) => (
                <div
                  key={day}
                  className={twMerge(
                    'text-center font-bold uppercase text-slate-400',
                    isCompact ? 'py-0.5 text-[9px]' : 'py-1 text-[10px]'
                  )}
                >
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {dayCells.map((day, index) => {
                if (day === null) {
                  return <div key={`empty-${index}`} className={isCompact ? 'h-7' : 'h-9'} />;
                }
                const iso = toIsoDate(viewYear, viewMonth, day);
                const isSelected = value === iso;
                const isToday = todayIso === iso;
                const isDisabled = isDateDisabled(iso, min, max);
                return (
                  <button
                    key={iso}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => selectDay(day)}
                    className={twMerge(
                      'rounded-md font-semibold transition-colors',
                      isCompact ? 'h-7 text-[10px]' : 'h-9 text-xs',
                      isSelected
                        ? 'bg-primary text-white shadow-sm'
                        : isToday
                          ? 'border border-primary/40 bg-primary/5 text-primary'
                          : 'text-slate-700 hover:bg-slate-100',
                      isDisabled && 'cursor-not-allowed opacity-30 hover:bg-transparent'
                    )}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            <div className={twMerge('mt-3 flex items-center justify-between border-t border-slate-100 pt-3', isCompact && 'mt-2 pt-2')}>
              <button
                type="button"
                onClick={() => {
                  if (!isDateDisabled(todayIso, min, max)) {
                    onChange(todayIso);
                    setOpen(false);
                  }
                }}
                disabled={isDateDisabled(todayIso, min, max)}
                className={twMerge(
                  'font-bold text-primary hover:text-primary-hover disabled:cursor-not-allowed disabled:opacity-40',
                  isCompact ? 'text-[10px]' : 'text-xs'
                )}
              >
                Today
              </button>
              {clearable && value && (
                <button
                  type="button"
                  onClick={() => {
                    onChange('');
                    setOpen(false);
                  }}
                  className={twMerge(
                    'font-semibold text-slate-500 hover:text-slate-800',
                    isCompact ? 'text-[10px]' : 'text-xs'
                  )}
                >
                  Clear
                </button>
              )}
            </div>
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
            aria-label={ariaLabel || label || 'Select date'}
            aria-expanded={open}
            aria-haspopup="dialog"
            onClick={() => (open ? setOpen(false) : openCalendar())}
            className={triggerClass}
          >
            <span className={clsx('truncate', !displayValue && 'text-slate-400')}>
              {displayValue || placeholder}
            </span>
            <Calendar className={clsx('shrink-0 text-slate-400', isCompact ? 'h-3 w-3' : 'h-4 w-4')} />
          </button>
          {clearable && value && !disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              className={twMerge(
                'absolute top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700',
                isCompact ? 'right-6' : 'right-9'
              )}
              aria-label="Clear date"
            >
              <X className={isCompact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
            </button>
          )}
          {name && <input type="hidden" name={name} value={value} />}
        </div>
        {error && <span className="text-xs font-medium text-rose-500">{error}</span>}
        {calendar}
      </div>
    );
  }
);

DatePicker.displayName = 'DatePicker';
