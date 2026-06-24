import { NextRequest, NextResponse } from 'next/server';
import { sendBulkReachCertificatesEmailAction } from '@/actions/reach';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      clientId?: string;
      certificateIds?: string[];
    };

    if (!body.clientId?.trim()) {
      return NextResponse.json({ success: false, error: 'Client ID is required.' }, { status: 400 });
    }

    const result = await sendBulkReachCertificatesEmailAction(
      body.clientId.trim(),
      body.certificateIds || []
    );

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (err: unknown) {
    console.error('[api/reach/certificates/bulk-email]', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to send RC certificates.',
      },
      { status: 500 }
    );
  }
}
