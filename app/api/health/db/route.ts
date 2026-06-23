import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const users = await prisma.users.count();
    return NextResponse.json({ ok: true, users });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database unreachable';
    console.error('[health/db]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
