import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/auth/session';
import {
  generateReachCertificateDocx,
} from '@/services/reach-certificate-docx';
import { buildReachDocxData } from '@/lib/reach-pdf-data';
import { getLastDateOfYear, getTodayDateString, isReachCertificateType, REACH_CERTIFICATE_TYPE } from '@/lib/reach-certificate';

function docxResponse(buffer: Buffer, fileName: string) {
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `inline; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const certificateId = searchParams.get('certificateId');
  const adminSupabase = createAdminClient();

  if (certificateId) {
    const { data: cert, error } = await adminSupabase
      .from('certificates')
      .select(
        `
        id,
        certificate_number,
        registration_number,
        tonnage_band,
        issued_at,
        expires_at,
        client_id,
        type,
        clients (
          company_name,
          uuid_number,
          address,
          city,
          state,
          postal_code,
          country
        ),
        chemicals (
          chemical_name,
          cas_number,
          ec_number,
          tonnage_band
        )
      `
      )
      .eq('id', certificateId)
      .single();

    if (error || !cert || !isReachCertificateType(cert)) {
      return NextResponse.json({ error: 'RC certificate not found.' }, { status: 404 });
    }

    const clientRecord = Array.isArray(cert.clients) ? cert.clients[0] : cert.clients;
    const chemicalRecord = Array.isArray(cert.chemicals) ? cert.chemicals[0] : cert.chemicals;

    if (!clientRecord || !chemicalRecord) {
      return NextResponse.json({ error: 'RC certificate not found.' }, { status: 404 });
    }

    const isAdmin = session.role === 'MASTER_ADMIN' || session.role === 'SUPER_ADMIN';
    const isOwner = session.role === 'CLIENT' && session.clientId === cert.client_id;
    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const issuedDate = cert.issued_at ? cert.issued_at.split('T')[0] : getTodayDateString();
    const validatedDate = cert.expires_at
      ? cert.expires_at.split('T')[0]
      : getLastDateOfYear();

    try {
      const docxBuffer = generateReachCertificateDocx(
        buildReachDocxData(clientRecord, chemicalRecord, {
          registrationNumber: cert.registration_number?.trim() || '—',
          issuedDate,
          validatedDate,
          tonnageBand: cert.tonnage_band || chemicalRecord.tonnage_band,
        })
      );

      return docxResponse(docxBuffer, `${cert.certificate_number}.docx`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'DOCX generation failed.';
      return NextResponse.json({ error: message }, { status: 500 });
    }
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

  const [{ data: client }, { data: chemical }, { data: clientChem }, { data: existingCert }] =
    await Promise.all([
      adminSupabase
        .from('clients')
        .select('id, company_name, uuid_number, address, city, state, postal_code, country')
        .eq('id', clientId)
        .single(),
      adminSupabase
        .from('chemicals')
        .select('id, chemical_name, cas_number, ec_number, tonnage_band')
        .eq('id', chemicalId)
        .single(),
      adminSupabase
        .from('client_chemicals')
        .select('id, validity_date, status')
        .eq('client_id', clientId)
        .eq('chemical_id', chemicalId)
        .eq('status', 'active')
        .maybeSingle(),
      adminSupabase
        .from('certificates')
        .select('registration_number, issued_at, expires_at, tonnage_band')
        .eq('client_id', clientId)
        .eq('chemical_id', chemicalId)
        .eq('type', REACH_CERTIFICATE_TYPE)
        .order('issued_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (!client || !chemical || !clientChem) {
    return NextResponse.json({ error: 'Client substance not found.' }, { status: 404 });
  }

  const registrationNumber =
    searchParams.get('registrationNumber')?.trim() ||
    existingCert?.registration_number?.trim() ||
    '—';

  const issuedDate =
    searchParams.get('issuedDate') ||
    (existingCert?.issued_at ? existingCert.issued_at.split('T')[0] : getTodayDateString());

  const validatedDate =
    searchParams.get('validatedDate') ||
    (existingCert?.expires_at
      ? existingCert.expires_at.split('T')[0]
      : clientChem.validity_date?.split('T')[0] || getLastDateOfYear());

  const tonnageBand = searchParams.has('tonnageBand')
    ? searchParams.get('tonnageBand')?.trim() || null
    : existingCert?.tonnage_band ?? chemical.tonnage_band ?? null;

  try {
    const certNumber = `RC-preview-${chemicalId.slice(0, 8)}`;

    const docxBuffer = generateReachCertificateDocx(
      buildReachDocxData(client, chemical, {
        registrationNumber,
        issuedDate,
        validatedDate,
        tonnageBand,
      })
    );

    return docxResponse(docxBuffer, `${certNumber}.docx`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'DOCX generation failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
