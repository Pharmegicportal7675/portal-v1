import { redirect } from 'next/navigation';
import type { SessionPayload } from '@/lib/auth/session';

export function redirectToLoginPage(error?: string, redirectTo?: string): never {
  const params = new URLSearchParams();
  if (error) params.set('error', error);
  if (redirectTo) params.set('redirectTo', redirectTo);
  const qs = params.toString();
  redirect(qs ? `/login?${qs}` : '/login');
}

export function redirectToRoleHome(role: SessionPayload['role']): never {
  if (role === 'MASTER_ADMIN' || role === 'SUPER_ADMIN') {
    redirect('/admin');
  }
  if (role === 'CLIENT') {
    redirect('/client');
  }
  redirectToLoginPage('Unauthorized');
}
