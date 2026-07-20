import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { regenerateMissingTccCertificateFiles } from '@/lib/regenerate-tcc-certificate-file';

export const runtime = 'nodejs';
export const maxDuration = 300;

function isAuthorized(request: NextRequest, session: Awaited<ReturnType<typeof getSession>>): boolean {
  const secret = process.env.REPAIR_ATTACHMENTS_SECRET?.trim();
  if (secret) {
    const header = request.headers.get('x-repair-secret')?.trim();
    const query = new URL(request.url).searchParams.get('secret')?.trim();
    if (header === secret || query === secret) return true;
  }

  return Boolean(
    session && (session.role === 'MASTER_ADMIN' || session.role === 'SUPER_ADMIN')
  );
}

/** Live-only repair: regenerate missing TCC PDFs on server disk (add-only, no deletes). */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!isAuthorized(request, session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await regenerateMissingTccCertificateFiles();
    return NextResponse.json({
      ok: true,
      message: 'Live attachment repair completed (add-only).',
      ...result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Live repair failed.';
    console.error('[api/admin/repair-attachments]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
