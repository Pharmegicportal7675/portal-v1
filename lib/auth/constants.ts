export const SESSION_COOKIE = 'pharmegic_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export function getAuthSecret(): Uint8Array {
  const secret =
    process.env.AUTH_SECRET || 'pharmegic-fallback-secret-change-in-production';
  return new TextEncoder().encode(secret);
}
