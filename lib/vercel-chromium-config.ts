/** Remote Chromium pack for bundled PDF generation (@sparticuz/chromium-min). */
export function getVercelChromiumPackUrl(): string {
  const configured = process.env.CHROMIUM_REMOTE_EXEC_PATH?.trim();
  if (configured) return configured;

  // Must match @sparticuz/chromium-min version (148.0.0) — x64 pack for Vercel Lambda.
  return 'https://github.com/Sparticuz/chromium/releases/download/v148.0.0/chromium-v148.0.0-pack.x64.tar';
}
