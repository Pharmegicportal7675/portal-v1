import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/db/admin';
import { getSession } from '@/lib/auth/session';
import { formatErrorMessage } from '@/lib/format-error';
import { getUserManual, removeUserManual, saveUserManual } from '@/lib/user-manual-storage';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** Max upload size for the user manual (50 MB) — covers PDF/PPT/DOC files. */
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function isAdminRole(role: string): boolean {
  return role === 'MASTER_ADMIN' || role === 'SUPER_ADMIN';
}

/** Download the current user manual — available to any signed-in user. */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const manual = await getUserManual(createAdminClient());
    if (!manual) {
      return NextResponse.json({ error: 'No user manual has been uploaded yet.' }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(manual.buffer), {
      headers: {
        'Content-Type': manual.contentType,
        'Content-Disposition': `attachment; filename="${manual.fileName}"`,
        'Content-Length': String(manual.buffer.length),
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
      },
    });
  } catch (err: unknown) {
    console.error('[user-manual GET]', err);
    return NextResponse.json(
      { error: formatErrorMessage(err) || 'Failed to load user manual.' },
      { status: 500 }
    );
  }
}

/** Upload / replace the user manual — master & super admins only. */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !isAdminRole(session.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'Please choose a file to upload.' }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: 'File is too large. Maximum size is 50 MB.' },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const manifest = await saveUserManual(createAdminClient(), {
      buffer,
      fileName: file.name || 'user-manual',
      contentType: file.type || 'application/octet-stream',
    });

    return NextResponse.json({ success: true, manual: manifest });
  } catch (err: unknown) {
    console.error('[user-manual POST]', err);
    return NextResponse.json(
      { error: formatErrorMessage(err) || 'Failed to upload user manual.' },
      { status: 500 }
    );
  }
}

/** Remove the current user manual — master & super admins only. */
export async function DELETE() {
  try {
    const session = await getSession();
    if (!session || !isAdminRole(session.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await removeUserManual(createAdminClient());
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('[user-manual DELETE]', err);
    return NextResponse.json(
      { error: formatErrorMessage(err) || 'Failed to remove user manual.' },
      { status: 500 }
    );
  }
}
