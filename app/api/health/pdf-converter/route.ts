import { NextResponse } from 'next/server';
import { resolveReachPdfConverterStatus } from '@/lib/reach-pdf-converter-status';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const status = await resolveReachPdfConverterStatus();
    return NextResponse.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF converter status check failed';
    console.error('[health/pdf-converter]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
