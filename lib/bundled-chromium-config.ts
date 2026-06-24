/** Remote Chromium pack for bundled PDF generation (@sparticuz/chromium-min). */
export function getBundledChromiumPackUrl(): string {
  const fromEnv = process.env.CHROMIUM_PACK_URL?.trim();
  if (fromEnv) return fromEnv;

  // Must match @sparticuz/chromium-min version (148.0.0) — x64 pack.
  return 'https://github.com/Sparticuz/chromium/releases/download/v148.0.0/chromium-v148.0.0-pack.tar';
}
