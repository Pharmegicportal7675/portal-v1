import { NextResponse } from 'next/server';
import { runPdfWorkerCheck } from '@/services/reach-certificate-puppeteer-pdf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const output = await runPdfWorkerCheck();
    return NextResponse.json({ ok: true, output });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF worker check failed';
    console.error('[health/pdf-worker]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
