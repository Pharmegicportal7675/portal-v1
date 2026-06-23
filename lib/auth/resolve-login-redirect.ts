import type { SessionPayload } from '@/lib/auth/session';

export function resolveLoginRedirect(
  role: SessionPayload['role'],
  requestedRedirect?: string | null
): string {
  const roleHome = role === 'CLIENT' ? '/client' : '/admin';
  const redirectTo = String(requestedRedirect ?? '').trim();

  if (!redirectTo.startsWith('/') || redirectTo.startsWith('//')) {
    return roleHome;
  }

  if (role === 'CLIENT' && redirectTo.startsWith('/client')) {
    return redirectTo;
  }

  if (role !== 'CLIENT' && redirectTo.startsWith('/admin')) {
    return redirectTo;
  }

  return roleHome;
}
