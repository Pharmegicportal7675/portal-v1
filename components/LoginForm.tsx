'use client';

import { Button } from './ui/Button';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { FormLabel } from './ui/FormLabel';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

export default function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '';
  const errorParam = searchParams.get('error');
  const initialError =
    errorParam === 'SessionExpired'
      ? 'Your session expired. Please sign in again.'
      : errorParam === 'Unauthorized'
        ? 'You are not authorized to access that area.'
        : errorParam === 'InvalidCredentials'
          ? 'Invalid email or password.'
          : '';

  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg] = useState(initialError);

  return (
    <div className="w-full max-w-[500px] bg-white rounded-2xl shadow-xl border border-slate-100 p-8 shadow-emerald-900/50" suppressHydrationWarning>
      <div className="flex flex-col items-center mb-8">
        <BrandLogo variant="full" href="/" className="mb-10" />
        <h1 className="text-3xl font-bold text-center mb-2">Welcome to Pharmegic</h1>
        <p className="text-sm text-slate-500 text-center font-medium">
          Compliance &amp; TCC Certificate Management System
        </p>
      </div>

      {errorMsg && (
        <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-100 text-xs font-semibold text-rose-600 flex items-start gap-2">
          <span className="text-rose-400 mt-0.5">⚠</span>
          {errorMsg}
        </div>
      )}

      <form action="/api/auth/login" method="POST" className="space-y-5">
        {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}

        <div className="w-full flex flex-col gap-1.5">
          <FormLabel required className="flex items-center gap-1.5 normal-case">
            <Mail className="h-3.5 w-3.5 text-slate-400" /> Corporate Email
          </FormLabel>
          <input
            type="email"
            id="login-email"
            name="email"
            placeholder="officer@company.com"
            autoComplete="email"
            required
            className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary transition-colors"
          />
        </div>

        <div className="w-full flex flex-col gap-1.5">
          <FormLabel required className="flex items-center gap-1.5 normal-case">
            <Lock className="h-3.5 w-3.5 text-slate-400" /> Password
          </FormLabel>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              id="login-password"
              name="password"
              placeholder="••••••••"
              autoComplete="current-password"
              required
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 pr-10 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <Button type="submit" id="login-submit" className="w-full h-11 text-sm font-bold">
          Authenticate Session
        </Button>
      </form>
    </div>
  );
}
