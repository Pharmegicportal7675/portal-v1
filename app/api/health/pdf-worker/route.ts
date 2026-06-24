import { NextResponse } from 'next/server';
import { runInProcessPdfCheck, runPdfWorkerCheck } from '@/services/reach-certificate-puppeteer-pdf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const inProcess = await runInProcessPdfCheck();
    let worker: string | null = null;
    let workerError: string | null = null;

    if (process.env.REACH_PDF_USE_WORKER === '1') {
      try {
        worker = await runPdfWorkerCheck();
      } catch (error) {
        workerError = error instanceof Error ? error.message : 'PDF worker check failed';
      }
    }

    return NextResponse.json({
      ok: true,
      mode: process.env.REACH_PDF_USE_WORKER === '1' ? 'worker' : 'in-process',
      inProcess,
      worker,
      workerError,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF check failed';
    console.error('[health/pdf-worker]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
