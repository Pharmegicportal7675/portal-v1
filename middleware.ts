import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { SESSION_COOKIE, getAuthSecret } from '@/lib/auth/constants';
import { getRequestOrigin } from '@/lib/http/get-request-origin';

const ADMIN_ROLES = ['SUPER_ADMIN', 'MASTER_ADMIN'];
const CLIENT_ROLE = 'CLIENT';

function redirectToRoleHome(request: NextRequest, role: string) {
  const origin = getRequestOrigin(request);
  if (ADMIN_ROLES.includes(role)) {
    return NextResponse.redirect(new URL('/admin', origin));
  }
  if (role === CLIENT_ROLE) {
    return NextResponse.redirect(new URL('/client', origin));
  }
  return NextResponse.redirect(new URL('/login', origin));
}

async function readSessionRole(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
    return (payload.role as string) || null;
  } catch {
    return null;
  }
}

// Only handle entry routes here. /admin and /client auth is enforced in their layouts.
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === '/login') {
    const role = await readSessionRole(request);
    if (role) {
      return redirectToRoleHome(request, role);
    }
    return NextResponse.next();
  }

  if (pathname === '/') {
    const role = await readSessionRole(request);
    if (role) {
      return redirectToRoleHome(request, role);
    }
    return NextResponse.redirect(new URL('/login', getRequestOrigin(request)));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/login'],
};
