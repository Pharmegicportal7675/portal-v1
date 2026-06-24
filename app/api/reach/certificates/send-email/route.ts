import { NextRequest, NextResponse } from 'next/server';
import { sendReachCertificateEmailAction } from '@/actions/reach';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { certificateId?: string };

    if (!body.certificateId?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Certificate ID is required.' },
        { status: 400 }
      );
    }

    const result = await sendReachCertificateEmailAction(body.certificateId.trim());
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (err: unknown) {
    console.error('[api/reach/certificates/send-email]', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to send email.' },
      { status: 500 }
    );
  }
}
