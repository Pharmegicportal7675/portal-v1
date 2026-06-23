export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const renderUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (renderUrl) {
    console.info(`[RC PDF] HTML → PDF render URL configured (${renderUrl})`);
    return;
  }

  console.warn('[RC PDF] Set NEXT_PUBLIC_APP_URL for HTML → PDF generation.');
}
