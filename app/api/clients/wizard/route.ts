import { NextRequest, NextResponse } from 'next/server';
import { createClientAction, updateClientWizardAction } from '@/actions/client-wizard';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      clientId?: string;
      profile?: unknown;
      contacts?: unknown;
    };

    const payload = {
      profile: body.profile,
      contacts: body.contacts,
    };

    const result = body.clientId?.trim()
      ? await updateClientWizardAction(body.clientId.trim(), payload)
      : await createClientAction(null, payload);

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (err: unknown) {
    console.error('[api/clients/wizard]', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to save client.',
      },
      { status: 500 }
    );
  }
}
