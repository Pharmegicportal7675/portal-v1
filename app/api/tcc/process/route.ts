import { NextRequest, NextResponse } from 'next/server';
import { processTccAction } from '@/actions/tcc';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      applicationId?: string;
      status?: 'approved' | 'rejected' | 'changes_required';
      rejectionReason?: string;
    };

    if (!body.applicationId?.trim()) {
      return NextResponse.json({ success: false, error: 'Application ID is required.' }, { status: 400 });
    }
    if (!body.status || !['approved', 'rejected', 'changes_required'].includes(body.status)) {
      return NextResponse.json({ success: false, error: 'Valid status is required.' }, { status: 400 });
    }

    const result = await processTccAction(
      body.applicationId.trim(),
      body.status,
      body.rejectionReason || ''
    );

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (err: unknown) {
    console.error('[api/tcc/process]', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to process TCC application.',
      },
      { status: 500 }
    );
  }
}
