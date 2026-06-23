import { NextRequest } from 'next/server';

function stripPort(host: string): string {
  return host.replace(/:\d+$/, '').toLowerCase();
}

function readForwardedOrigin(request: NextRequest): string | null {
  const forwardedHost = request.headers.get('x-forwarded-host');
  if (!forwardedHost) return null;

  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  const host = forwardedHost.split(',')[0]?.trim();
  const proto = forwardedProto.split(',')[0]?.trim();
  if (!host || !proto) return null;

  return `${proto}://${host}`;
}

export function getRequestOrigin(request: NextRequest): string {
  const forwarded = readForwardedOrigin(request);
  if (forwarded) return forwarded;

  const publicUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (publicUrl) {
    try {
      return new URL(publicUrl).origin;
    } catch {
      // Ignore invalid env value and continue with request origin.
    }
  }

  const origin = request.nextUrl.origin;
  const host = stripPort(request.nextUrl.host);
  if (host === '0.0.0.0' || host === '127.0.0.1' || host === 'localhost') {
    const fallback = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (fallback) {
      try {
        return new URL(fallback).origin;
      } catch {
        return origin;
      }
    }
  }

  return origin;
}
