import { create } from 'zustand';
import { formatErrorMessage } from '@/lib/format-error';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (message: string, type: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (message, type, duration = 4000) => {
    const id = Math.random().toString(36).substring(2, 9);
    set((state) => ({
      toasts: [...state.toasts, { id, message, type, duration }],
    }));

    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, duration);
    }
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));

function toMessage(msg: unknown): string {
  return typeof msg === 'string' ? msg : formatErrorMessage(msg);
}

export const toast = {
  success: (msg: unknown, duration?: number) => useToastStore.getState().addToast(toMessage(msg), 'success', duration),
  error: (msg: unknown, duration?: number) => useToastStore.getState().addToast(toMessage(msg), 'error', duration),
  warning: (msg: unknown, duration?: number) => useToastStore.getState().addToast(toMessage(msg), 'warning', duration),
  info: (msg: unknown, duration?: number) => useToastStore.getState().addToast(toMessage(msg), 'info', duration),
};
