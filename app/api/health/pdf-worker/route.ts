import { NextRequest, NextResponse } from 'next/server';
import { resolvePuppeteerProjectRoot, shouldPreferPdfWorker } from '@/lib/puppeteer-runtime';
import { runInProcessPdfCheck, runPdfWorkerCheck } from '@/services/reach-certificate-puppeteer-pdf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const pdfRoot = resolvePuppeteerProjectRoot();
  const preferWorker = shouldPreferPdfWorker();

  if (request.nextUrl.searchParams.get('launch') === '1') {
    process.env.REACH_PDF_HEALTH_LAUNCH = '1';
  }

  let inProcess: string | null = null;
  let inProcessError: string | null = null;
  let worker: string | null = null;
  let workerError: string | null = null;

  if (!preferWorker) {
    try {
      inProcess = await runInProcessPdfCheck();
    } catch (error) {
      inProcessError = error instanceof Error ? error.message : 'In-process PDF check failed';
    }
  }

  // Always verify the CJS worker on Hostinger (primary PDF path there).
  try {
    worker = await runPdfWorkerCheck();
  } catch (error) {
    workerError = error instanceof Error ? error.message : 'PDF worker check failed';
  }

  // If worker preferred but we still want a secondary signal, try in-process once.
  if (preferWorker && !inProcess && request.nextUrl.searchParams.get('inprocess') === '1') {
    try {
      inProcess = await runInProcessPdfCheck();
    } catch (error) {
      inProcessError = error instanceof Error ? error.message : 'In-process PDF check failed';
    }
  }

  const ok = Boolean(worker || inProcess);
  const body = {
    ok,
    mode: preferWorker ? 'worker' : worker && !inProcess ? 'worker-fallback' : 'in-process',
    pdfRoot,
    cwd: process.cwd(),
    inProcess,
    inProcessError,
    worker,
    workerError,
  };

  if (!ok) {
    console.error('[health/pdf-worker]', workerError || inProcessError || 'PDF check failed');
    return NextResponse.json(body, { status: 500 });
  }

  return NextResponse.json(body);
}
