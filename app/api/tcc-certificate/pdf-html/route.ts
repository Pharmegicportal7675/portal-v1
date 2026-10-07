import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/db/admin';
import { getSession } from '@/lib/auth/session';
import { loadReachCertificateStoredPdf } from '@/lib/reach-certificate-storage';
import {
  loadTccHtmlDataByApplicationId,
  loadTccHtmlDataByCertificateId,
} from '@/lib/tcc-certificate-html-pdf-server';
import { renderTccCertificateHtmlDocument } from '@/services/tcc-certificate-html-pdf-render';
import { generateTccHtmlPdfFromHtml, isReachPuppeteerPdfAvailable } from '@/services/reach-certificate-puppeteer-pdf';

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

function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.length > 5 && buffer.subarray(0, 4).toString('latin1') === '%PDF';
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const certificateId = searchParams.get('certificateId');
  const applicationId = searchParams.get('applicationId');
  const adminSupabase = createAdminClient();

  try {
    if (certificateId) {
      const htmlData = await loadTccHtmlDataByCertificateId(adminSupabase, certificateId);
      if (!htmlData) {
        return NextResponse.json({ error: 'TCC certificate not found.' }, { status: 404 });
      }

      const { data: cert } = await adminSupabase
        .from('certificates')
        .select('client_id, certificate_number, file_url')
        .eq('id', certificateId)
        .single();

      const isAdmin = session.role === 'MASTER_ADMIN' || session.role === 'SUPER_ADMIN';
      const isOwner = session.role === 'CLIENT' && session.clientId === cert?.client_id;
      if (!isAdmin && !isOwner) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const fileName = `${htmlData.certificateNumber}.pdf`;
      const stored = await loadReachCertificateStoredPdf(
        adminSupabase,
        cert?.certificate_number || htmlData.certificateNumber,
        cert?.file_url
      );
      if (stored && isPdfBuffer(stored.buffer)) {
        return pdfResponse(stored.buffer, fileName);
      }

      if (!isReachPuppeteerPdfAvailable()) {
        return NextResponse.json(
          { error: 'The certificate PDF is not on the server, and PDF generation is disabled.' },
          { status: 503 }
        );
      }

      const html = await renderTccCertificateHtmlDocument(htmlData);
      const pdfBuffer = await generateTccHtmlPdfFromHtml(html);
      return pdfResponse(pdfBuffer, fileName);
    }

    if (applicationId) {
      if (session.role !== 'MASTER_ADMIN' && session.role !== 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (!isReachPuppeteerPdfAvailable()) {
        return NextResponse.json(
          { error: 'PDF generation is disabled on this server.' },
          { status: 503 }
        );
      }

      const htmlData = await loadTccHtmlDataByApplicationId(adminSupabase, applicationId);
      const html = await renderTccCertificateHtmlDocument(htmlData);
      const pdfBuffer = await generateTccHtmlPdfFromHtml(html);
      return pdfResponse(pdfBuffer, `${htmlData.certificateNumber}.pdf`);
    }

    return NextResponse.json(
      { error: 'certificateId or applicationId is required.' },
      { status: 400 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'TCC certificate PDF generation failed.';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
