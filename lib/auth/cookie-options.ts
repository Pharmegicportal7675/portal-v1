import { SESSION_MAX_AGE } from '@/lib/auth/constants';

const isProduction = process.env.NODE_ENV === 'production';

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax' as const,
  maxAge: SESSION_MAX_AGE,
  path: '/',
};
