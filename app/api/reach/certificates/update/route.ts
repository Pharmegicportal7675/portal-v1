import { NextRequest, NextResponse } from 'next/server';
import { updateReachCertificateAction } from '@/actions/reach';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      certificateId?: string;
      registrationNumber?: string;
      issuedDate?: string;
      validatedDate?: string;
      tonnageBand?: string | null;
      allocatedQuantity?: number | null;
    };

    if (!body.certificateId?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Certificate ID is required.' },
        { status: 400 }
      );
    }

    const result = await updateReachCertificateAction(body.certificateId.trim(), {
      registrationNumber: body.registrationNumber?.trim() || '',
      issuedDate: body.issuedDate?.trim() || '',
      validatedDate: body.validatedDate?.trim() || '',
      tonnageBand: body.tonnageBand,
      allocatedQuantity: body.allocatedQuantity,
    });

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (err: unknown) {
    console.error('[api/reach/certificates/update]', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to update certificate.' },
      { status: 500 }
    );
  }
}
