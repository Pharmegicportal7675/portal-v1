import { NextRequest, NextResponse } from 'next/server';
import { deleteReachCertificateAction } from '@/actions/reach';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      certificateId?: string;
      clientId?: string;
    };

    if (!body.certificateId?.trim() || !body.clientId?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Certificate ID and client ID are required.' },
        { status: 400 }
      );
    }

    const result = await deleteReachCertificateAction(
      body.certificateId.trim(),
      body.clientId.trim()
    );

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (err: unknown) {
    console.error('[api/reach/certificates/delete]', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to delete CT certificate.',
      },
      { status: 500 }
    );
  }
}
