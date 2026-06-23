export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  try {
    const { prisma } = await import('@/lib/prisma');
    await prisma.$connect();
    const users = await prisma.users.count();
    console.info(`[portal] MySQL connected (${users} users in database)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error(`[portal] MySQL connection failed: ${message}`);
    console.error(
      '[portal] Check DATABASE_URL in hPanel — encode @ in password as %40; on Hostinger use localhost as host.'
    );
  }

  const renderUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (renderUrl) {
    console.info(`[RC PDF] HTML → PDF render URL configured (${renderUrl})`);
    return;
  }

  console.warn('[RC PDF] Set NEXT_PUBLIC_APP_URL for HTML → PDF generation.');
}
