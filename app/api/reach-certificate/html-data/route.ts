import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/db/admin';
import { getSession } from '@/lib/auth/session';
import { resolveRcBranding } from '@/lib/certificate-template-config';
import { buildReachHtmlData } from '@/lib/reach-certificate-html-data';
import {
  loadReachCertificateInputByCertificateId,
  loadReachCertificateInputByClientChemical,
  parseReachTonnageBandParam,
} from '@/lib/reach-certificate-api-input';
import { getActiveTemplate } from '@/services/db';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const certificateId = searchParams.get('certificateId');
  const adminSupabase = createAdminClient();
  const templateSettings = await getActiveTemplate(adminSupabase);
  const branding = resolveRcBranding(templateSettings);

  if (certificateId) {
    const input = await loadReachCertificateInputByCertificateId(adminSupabase, certificateId);
    if (!input) {
      return NextResponse.json({ error: 'CT certificate not found.' }, { status: 404 });
    }

    const isAdmin = session.role === 'MASTER_ADMIN' || session.role === 'SUPER_ADMIN';
    const isOwner = session.role === 'CLIENT' && session.clientId === input.clientId;
    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const htmlData = buildReachHtmlData(input.client, input.chemical, {
      registrationNumber: input.registrationNumber,
      issuedDate: input.issuedDate,
      validatedDate: input.validatedDate,
      tonnageBand: input.tonnageBand,
      accentColor: branding.accent_color,
      logoUrl: branding.logo,
      signatureUrl: branding.signature_image,
      footerText: branding.footer_text,
    });

    return NextResponse.json(htmlData);
  }

  const clientId = searchParams.get('clientId');
  const chemicalId = searchParams.get('chemicalId');

  if (!clientId || !chemicalId) {
    return NextResponse.json(
      { error: 'certificateId or clientId and chemicalId are required.' },
      { status: 400 }
    );
  }

  if (session.role !== 'MASTER_ADMIN' && session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

  const htmlData = buildReachHtmlData(input.client, input.chemical, {
    registrationNumber: input.registrationNumber,
    issuedDate: input.issuedDate,
    validatedDate: input.validatedDate,
    tonnageBand: input.tonnageBand,
    accentColor: branding.accent_color,
    logoUrl: branding.logo,
    signatureUrl: branding.signature_image,
    footerText: branding.footer_text,
  });

  return NextResponse.json(htmlData);
}
