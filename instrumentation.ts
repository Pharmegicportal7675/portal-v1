export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const renderUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (renderUrl) {
    console.info(`[RC PDF] HTML → PDF render URL configured (${renderUrl})`);
  } else {
    console.warn('[RC PDF] Set NEXT_PUBLIC_APP_URL for HTML → PDF generation.');
  }

  if (!process.env.DATABASE_URL) {
    console.warn('[portal] DATABASE_URL is not set in hPanel environment variables.');
  }
}
