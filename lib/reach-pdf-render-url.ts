/** Base URL Puppeteer uses to load /reach-cert/print (must be reachable from the server). */
export function resolvePdfRenderBaseUrl(): string {
  const internal = process.env.REACH_PDF_RENDER_URL?.replace(/\/$/, '');
  if (internal) return internal;

  const publicUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (publicUrl) return publicUrl;

  const port = process.env.PORT || '3000';
  return `http://127.0.0.1:${port}`;
}
