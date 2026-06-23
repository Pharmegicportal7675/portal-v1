import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { SESSION_COOKIE, getAuthSecret } from '@/lib/auth/constants';

const ADMIN_ROLES = ['SUPER_ADMIN', 'MASTER_ADMIN'];
const CLIENT_ROLE = 'CLIENT';

function redirectToRoleHome(request: NextRequest, role: string) {
  if (ADMIN_ROLES.includes(role)) {
    return NextResponse.redirect(new URL('/admin', request.url));
  }
  if (role === CLIENT_ROLE) {
    return NextResponse.redirect(new URL('/client', request.url));
  }
  return NextResponse.redirect(new URL('/login', request.url));
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
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/login'],
};
