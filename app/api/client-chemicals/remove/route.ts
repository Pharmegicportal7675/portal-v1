import { NextRequest, NextResponse } from 'next/server';
import { removeChemicalFromClientAction } from '@/actions/clients';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      clientId?: string;
      chemicalId?: string;
    };

    if (!body.clientId?.trim() || !body.chemicalId?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Client ID and substance ID are required.' },
        { status: 400 }
      );
    }

    const result = await removeChemicalFromClientAction(
      body.clientId.trim(),
      body.chemicalId.trim()
    );

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (err: unknown) {
    console.error('[api/client-chemicals/remove]', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to remove substance.',
      },
      { status: 500 }
    );
  }
}
