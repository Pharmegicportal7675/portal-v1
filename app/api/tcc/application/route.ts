import { NextRequest, NextResponse } from 'next/server';
import { applyForTccAction, updateTccApplicationAction } from '@/actions/tcc';

/** TCC apply/update — dedicated POST route (Hostinger does not reliably handle server-action POSTs to page URLs). */
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const applicationId = String(formData.get('application_id') ?? '').trim();
    const result = applicationId
      ? await updateTccApplicationAction(null, formData)
      : await applyForTccAction(null, formData);

    const status = result.success ? 200 : 400;
    return NextResponse.json(result, { status });
  } catch (err: unknown) {
    console.error('[api/tcc/application]', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to save application.',
      },
      { status: 500 }
    );
  }
}
