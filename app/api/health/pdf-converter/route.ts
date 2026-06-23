import { NextResponse } from 'next/server';
import { resolveReachPdfConverterStatus } from '@/lib/reach-pdf-converter-status';

export async function GET() {
  const status = await resolveReachPdfConverterStatus();
  return NextResponse.json(status);
}
