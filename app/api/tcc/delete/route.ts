import { NextRequest, NextResponse } from 'next/server';
import { deleteTccApplicationAction } from '@/actions/tcc';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { applicationId?: string };

    if (!body.applicationId?.trim()) {
      return NextResponse.json({ success: false, error: 'Application ID is required.' }, { status: 400 });
    }

    const result = await deleteTccApplicationAction(body.applicationId.trim());
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (err: unknown) {
    console.error('[api/tcc/delete]', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to delete TCC application.',
      },
      { status: 500 }
    );
  }
}
