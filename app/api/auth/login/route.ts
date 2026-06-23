import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth/authenticate-user';
import { SESSION_COOKIE } from '@/lib/auth/constants';
import { SESSION_COOKIE_OPTIONS } from '@/lib/auth/cookie-options';
import { resolveLoginRedirect } from '@/lib/auth/resolve-login-redirect';
import { signSessionToken } from '@/lib/auth/sign-session';

async function readLoginBody(request: NextRequest) {
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const body = await request.json();
    return {
      email: String(body.email ?? ''),
      password: String(body.password ?? ''),
      redirectTo: String(body.redirectTo ?? ''),
    };
  }

  const formData = await request.formData();
  return {
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
    redirectTo: String(formData.get('redirectTo') ?? ''),
  };
}

function loginFailureRedirect(request: NextRequest, redirectTo: string, message: string) {
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('error', message);
  if (redirectTo) {
    loginUrl.searchParams.set('redirectTo', redirectTo);
  }
  return NextResponse.redirect(loginUrl);
}

export async function POST(request: NextRequest) {
  let email = '';
  let password = '';
  let redirectTo = '';

  try {
    const body = await readLoginBody(request);
    email = body.email;
    password = body.password;
    redirectTo = body.redirectTo;
  } catch {
    return loginFailureRedirect(request, '', 'InvalidCredentials');
  }

  const auth = await authenticateUser(email, password);
  if (!auth.ok) {
    return loginFailureRedirect(request, redirectTo, 'InvalidCredentials');
  }

  const target = resolveLoginRedirect(auth.session.role, redirectTo);
  const token = await signSessionToken(auth.session);

  const response = NextResponse.redirect(new URL(target, request.url));
  response.cookies.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
  return response;
}
