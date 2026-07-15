import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/db/admin';
import { getSession } from '@/lib/auth/session';
import { formatErrorMessage } from '@/lib/format-error';
import { resolveReachCertificateDownloadFile } from '@/lib/reach-certificate-pdf';
import {
  loadReachCertificateInputByCertificateId,
  loadReachCertificateInputByClientChemical,
  parseReachTonnageBandParam,
} from '@/lib/reach-certificate-api-input';
import { isReachCertificateType } from '@/lib/reach-certificate';

/** Server-side RC certificate PDF — stored file first, then HTML/DOCX generation. */
export const runtime = 'nodejs';
export const maxDuration = 120;

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

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const certificateId = searchParams.get('certificateId');
    const isAdmin = session.role === 'MASTER_ADMIN' || session.role === 'SUPER_ADMIN';
    // The stamp-less copy is restricted to admins only.
    const withoutStamp = searchParams.get('withoutStamp') === '1' && isAdmin;
    const adminSupabase = createAdminClient();

    if (certificateId) {
      const { data: cert, error: certError } = await adminSupabase
        .from('certificates')
        .select('id, client_id, certificate_number, file_url, type')
        .eq('id', certificateId)
        .single();

      if (certError || !cert || !isReachCertificateType(cert)) {
        return NextResponse.json({ error: 'CT certificate not found.' }, { status: 404 });
      }

      const isOwner = session.role === 'CLIENT' && session.clientId === cert.client_id;
      if (!isAdmin && !isOwner) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const input = await loadReachCertificateInputByCertificateId(adminSupabase, certificateId);
      if (!input) {
        return NextResponse.json({ error: 'CT certificate not found.' }, { status: 404 });
      }

      const file = await resolveReachCertificateDownloadFile(adminSupabase, input, {
        fileUrl: cert.file_url,
        withoutStamp,
      });
      return pdfResponse(file.buffer, file.fileName);
    }

    if (!isAdmin) {
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

    const { data: existingCert } = await adminSupabase
      .from('certificates')
      .select('file_url')
      .eq('client_id', clientId)
      .eq('chemical_id', chemicalId)
      .eq('type', 'REACH')
      .order('issued_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const file = await resolveReachCertificateDownloadFile(adminSupabase, input, {
      fileUrl: existingCert?.file_url,
      withoutStamp,
    });
    return pdfResponse(file.buffer, file.fileName);
  } catch (err: unknown) {
    console.error('[reach-certificate/pdf-html]', err);
    const message = formatErrorMessage(err) || 'Certificate PDF generation failed.';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
