'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  closeOnBackdropClick?: boolean;
  /** Wider modal for application review / certificate preview */
  size?: 'default' | 'wide';
}

const sizeClasses = {
  default: 'max-w-[min(800px,calc(100vw-1.5rem))]',
  wide: 'max-w-[min(96rem,calc(100vw-1.5rem))]',
};

export function Dialog({
  isOpen,
  onClose,
  title,
  children,
  closeOnBackdropClick = false,
  size = 'default',
}: DialogProps) {
  const [mounted, setMounted] = useState(false);

  // Set mounted state
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;
  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-300"
        onClick={closeOnBackdropClick ? onClose : undefined}
      />

      {/* Dialog Content */}
      <div
        className={`relative w-full ${sizeClasses[size]} rounded-lg border border-slate-100 bg-white p-4 sm:p-6 shadow-xl transition-all duration-300 animate-slide-in max-h-[90vh] overflow-y-auto z-10`}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 flex-wrap">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-sm p-1 text-slate-400 opacity-70 transition-opacity hover:opacity-100 focus:outline-hidden hover:bg-slate-50 cursor-pointer"
          >
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </button>
        </div>

        {/* Body */}
        <div className="py-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}
