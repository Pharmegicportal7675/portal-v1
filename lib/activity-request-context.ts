import 'server-only';
import { headers } from 'next/headers';

/**
 * Server-only: reads request IP / approximate place for activity_logs.
 * Do not import this file from Client Components.
 */
export type ActivityRequestContext = {
  ip_address: string | null;
  location: string | null;
};

const PRIVATE_IP =
  /^(::1|::ffff:127\.|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|localhost)$/i;

function firstForwardedIp(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(',')[0]?.trim();
  if (!first) return null;
  // Strip IPv6 zone / port wrappers like [::1]:1234
  const cleaned = first.replace(/^\[|\]$/g, '').split('%')[0]?.trim() || '';
  return cleaned || null;
}

function extractClientIp(headerStore: Headers): string | null {
  const candidates = [
    headerStore.get('cf-connecting-ip'),
    headerStore.get('x-real-ip'),
    firstForwardedIp(headerStore.get('x-forwarded-for')),
    headerStore.get('x-client-ip'),
  ];

  for (const raw of candidates) {
    const ip = raw?.trim();
    if (ip) return ip;
  }
  return null;
}

function isPrivateOrLocalIp(ip: string): boolean {
  return PRIVATE_IP.test(ip) || ip === '0.0.0.0';
}

async function lookupGeoLocation(ip: string): Promise<string | null> {
  if (isPrivateOrLocalIp(ip)) return 'Local network';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 900);

  try {
    // Free, no API key — city / region / country only (no precise street address).
    const res = await fetch(
      `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
      {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      error?: boolean;
      city?: string;
      region?: string;
      country_name?: string;
    };
    if (data.error) return null;

    const parts = [data.city, data.region, data.country_name]
      .map((p) => (typeof p === 'string' ? p.trim() : ''))
      .filter(Boolean);
    // Prefer city + country when region duplicates city
    const unique = [...new Set(parts)];
    return unique.length > 0 ? unique.join(', ') : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve IP + approximate place from the current request (server actions / route handlers). */
export async function getActivityRequestContext(): Promise<ActivityRequestContext> {
  try {
    const headerStore = await headers();
    const ip_address = extractClientIp(headerStore);
    if (!ip_address) {
      return { ip_address: null, location: null };
    }
    const location = await lookupGeoLocation(ip_address);
    return { ip_address, location };
  } catch {
    // Outside a request (scripts/cron) — no headers available.
    return { ip_address: null, location: null };
  }
}
