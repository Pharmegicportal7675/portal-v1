import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/auth/session';
import { generateReachCertificateHtmlPdf } from '@/lib/reach-certificate-html-pdf-server';
import {
  loadReachCertificateInputByCertificateId,
  loadReachCertificateInputByClientChemical,
  parseReachTonnageBandParam,
} from '@/lib/reach-certificate-api-input';
import { isReachPuppeteerPdfAvailable } from '@/services/reach-certificate-puppeteer-pdf';

/** Server-side HTML → PDF (Puppeteer) — same layout as on-screen certificate preview. */
export const runtime = 'nodejs';
export const maxDuration = 60;

function pdfResponse(buffer: Buffer, fileName: string) {
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
    },
  });
}

/** Server-side HTML → PDF (Puppeteer) — same layout as on-screen certificate preview. */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isReachPuppeteerPdfAvailable()) {
    return NextResponse.json(
      { error: 'HTML PDF generation is disabled on this server.' },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const certificateId = searchParams.get('certificateId');
  const adminSupabase = createAdminClient();

  try {
    if (certificateId) {
      const input = await loadReachCertificateInputByCertificateId(adminSupabase, certificateId);
      if (!input) {
        return NextResponse.json({ error: 'RC certificate not found.' }, { status: 404 });
      }

      const isAdmin = session.role === 'MASTER_ADMIN' || session.role === 'SUPER_ADMIN';
      const isOwner = session.role === 'CLIENT' && session.clientId === input.clientId;
      if (!isAdmin && !isOwner) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const pdfBuffer = await generateReachCertificateHtmlPdf(input);
      return pdfResponse(pdfBuffer, `${input.certificateNumber}.pdf`);
    }

    if (session.role !== 'MASTER_ADMIN' && session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clientId = searchParams.get('clientId');
    const chemicalId = searchParams.get('chemicalId');
    if (!clientId || !chemicalId) {
      return NextResponse.json(
        { error: 'certificateId or clientId and chemicalId are required.' },
        { status: 400 }
      );
    }

    const input = await loadReachCertificateInputByClientChemical(adminSupabase, {
      clientId,
      chemicalId,
      registrationNumber: searchParams.get('registrationNumber'),
      issuedDate: searchParams.get('issuedDate'),
      validatedDate: searchParams.get('validatedDate'),
      tonnageBand: parseReachTonnageBandParam(searchParams),
    });

    if (!input) {
      return NextResponse.json({ error: 'Client substance not found.' }, { status: 404 });
    }

    const pdfBuffer = await generateReachCertificateHtmlPdf(input);
    return pdfResponse(pdfBuffer, `${input.certificateNumber}.pdf`);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Certificate PDF generation failed.';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
