import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'portal-v1',
    databaseUrl: process.env.DATABASE_URL ? 'configured' : 'missing',
  });
}
