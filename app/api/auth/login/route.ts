import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth/authenticate-user';
import { SESSION_COOKIE } from '@/lib/auth/constants';
import { SESSION_COOKIE_OPTIONS } from '@/lib/auth/cookie-options';
import { resolveLoginRedirect } from '@/lib/auth/resolve-login-redirect';
import { getRequestOrigin } from '@/lib/http/get-request-origin';
import { signSessionToken } from '@/lib/auth/sign-session';
import { createAdminClient } from '@/lib/db/admin';
import { writeActivityLog } from '@/lib/activity-log';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

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

// 303 (See Other) forces the browser to GET the target after a form POST
// (Post/Redirect/Get). The default 307 would replay the POST against the
// destination page and render a "not found" instead of the dashboard.
function loginFailureRedirect(request: NextRequest, redirectTo: string, message: string) {
  const loginUrl = new URL('/login', getRequestOrigin(request));
  loginUrl.searchParams.set('error', message);
  if (redirectTo) {
    loginUrl.searchParams.set('redirectTo', redirectTo);
  }
  return NextResponse.redirect(loginUrl, { status: 303 });
}

async function logLoginFailure(email: string, reason: string) {
  try {
    const normalized = email.trim().toLowerCase();
    const user = normalized
      ? await prisma.users.findFirst({
          where: { email: normalized },
          select: { id: true, client_id: true, email: true, role: true },
        })
      : null;

    await writeActivityLog(createAdminClient(), {
      client_id: user?.client_id ?? null,
      user_id: user?.id ?? null,
      action: 'USER_LOGIN_FAILED',
      entity_type: 'users',
      entity_id: user?.id ?? null,
      description: user
        ? `Failed login attempt for ${user.email} (${user.role.replace(/_/g, ' ')}) — ${reason}`
        : `Failed login attempt for ${normalized || 'unknown email'} — ${reason}`,
      metadata: {
        email: normalized || null,
        reason,
        role: user?.role ?? null,
      },
    });
  } catch (err) {
    console.error('[auth] Failed to write login-failure activity log', err);
  }
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
    await logLoginFailure('', 'Invalid request body');
    return loginFailureRedirect(request, '', 'InvalidCredentials');
  }

  const auth = await authenticateUser(email, password);
  if (!auth.ok) {
    await logLoginFailure(email, auth.error || 'Invalid credentials');
    return loginFailureRedirect(request, redirectTo, 'InvalidCredentials');
  }

  try {
    await writeActivityLog(createAdminClient(), {
      client_id: auth.session.clientId ?? null,
      user_id: auth.session.userId,
      action: 'USER_LOGIN',
      entity_type: 'users',
      entity_id: auth.session.userId,
      description: `${auth.session.email} logged in (${auth.session.role.replace(/_/g, ' ')})`,
      metadata: {
        email: auth.session.email,
        role: auth.session.role,
      },
    });
  } catch (err) {
    console.error('[auth] Failed to write login activity log', err);
  }

  const target = resolveLoginRedirect(auth.session.role, redirectTo);
  const token = await signSessionToken(auth.session);

  const response = NextResponse.redirect(new URL(target, getRequestOrigin(request)), {
    status: 303,
  });
  response.cookies.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
  return response;
}
