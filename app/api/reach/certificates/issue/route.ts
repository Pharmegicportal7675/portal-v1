import { NextRequest, NextResponse } from 'next/server';
import { issueReachCertificateFromPreviewAction } from '@/actions/reach';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      clientId?: string;
      chemicalId?: string;
      registrationNumber?: string;
      issuedDate?: string;
      validatedDate?: string;
      tonnageBand?: string | null;
    };

    if (!body.clientId?.trim() || !body.chemicalId?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Client ID and substance ID are required.' },
        { status: 400 }
      );
    }

    const result = await issueReachCertificateFromPreviewAction(
      body.clientId.trim(),
      body.chemicalId.trim(),
      {
        registrationNumber: body.registrationNumber?.trim() || '',
        issuedDate: body.issuedDate?.trim() || '',
        validatedDate: body.validatedDate?.trim() || '',
        tonnageBand: body.tonnageBand,
      }
    );

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (err: unknown) {
    console.error('[api/reach/certificates/issue]', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to issue certificate.' },
      { status: 500 }
    );
  }
}
