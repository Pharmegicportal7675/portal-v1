import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { formatErrorMessage } from '@/lib/format-error';
import { loadPoAttachmentForApplication } from '@/lib/tcc-po-attachment';

export const runtime = 'nodejs';
export const maxDuration = 60;

function isAdminRole(role: string): boolean {
  return role === 'MASTER_ADMIN' || role === 'SUPER_ADMIN';
}

function contentDisposition(fileName: string, inline: boolean): string {
  const safe = fileName.replace(/"/g, '');
  const type = inline ? 'inline' : 'attachment';
  return `${type}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/** Serve a TCC PO attachment by application id (auth required). */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const applicationId = searchParams.get('id')?.trim();
    if (!applicationId) {
      return NextResponse.json({ error: 'Application id is required.' }, { status: 400 });
    }

    const result = await loadPoAttachmentForApplication(applicationId);
    if (!result.ok) {
      const accept = request.headers.get('accept') || '';
      if (accept.includes('text/html')) {
        return new NextResponse(
          `<!DOCTYPE html><html><head><meta charset="utf-8"><title>PO attachment</title>
<style>body{font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#f8fafc;color:#334155}
.card{max-width:28rem;padding:1.5rem;border:1px solid #e2e8f0;border-radius:0.75rem;background:#fff;text-align:center}
h1{font-size:1.1rem;margin:0 0 0.5rem}p{font-size:0.875rem;margin:0;color:#64748b}</style></head>
<body><div class="card"><h1>PO attachment unavailable</h1><p>${result.error.replace(/</g, '&lt;')}</p></div></body></html>`,
          {
            status: result.status,
            headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
          }
        );
      }
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    if (!isAdminRole(session.role) && session.clientId !== result.clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const inline = searchParams.get('download') !== '1';
    return new NextResponse(new Uint8Array(result.file.buffer), {
      headers: {
        'Content-Type': result.file.contentType,
        'Content-Disposition': contentDisposition(result.file.fileName, inline),
        'Content-Length': String(result.file.buffer.length),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err: unknown) {
    console.error('[api/tcc/po-attachment]', err);
    return NextResponse.json(
      { error: formatErrorMessage(err) || 'Failed to load PO attachment.' },
      { status: 500 }
    );
  }
}
