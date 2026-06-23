import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      ok: false,
      error: 'DATABASE_URL is not set in environment variables',
    });
  }

  try {
    const { prisma } = await import('@/lib/prisma');
    const users = await prisma.users.count();
    return NextResponse.json({ ok: true, users });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database unreachable';
    console.error('[health/db]', message);
    return NextResponse.json({ ok: false, error: message });
  }
}
