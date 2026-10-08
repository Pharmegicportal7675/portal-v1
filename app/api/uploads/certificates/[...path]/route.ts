import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  findCertificatesFileByNames,
  resolveCertificatesFilePath,
} from '@/lib/certificates-upload-root';
import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/db/admin';
import { extractStorageRelativePath } from '@/lib/storage-paths';
import { resolveClientStorageFolder } from '@/lib/client-storage-folder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function guessContentType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'doc':
      return 'application/msword';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xls':
      return 'application/vnd.ms-excel';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    default:
      return 'application/octet-stream';
  }
}

function resolveSafeRelative(parts: string[]): string | null {
  const decoded = parts.map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });

  if (decoded.some((part) => !part || part === '.' || part === '..')) {
    return null;
  }

  return decoded.join('/');
}

function normalizeRelative(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+/, '');
}

async function clientOwnsRelativePath(
  clientId: string,
  relative: string
): Promise<boolean> {
  const needle = normalizeRelative(relative);
  const admin = createAdminClient();

  const [{ data: apps }, { data: certs }, { data: client }] = await Promise.all([
    admin
      .from('tcc_applications')
      .select('bo_attachment_url')
      .eq('client_id', clientId)
      .limit(200),
    admin.from('certificates').select('file_url').eq('client_id', clientId).limit(400),
    admin.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
  ]);

  for (const row of apps || []) {
    const pathFromUrl = extractStorageRelativePath(row.bo_attachment_url || '');
    if (pathFromUrl && normalizeRelative(pathFromUrl) === needle) return true;
    if ((row.bo_attachment_url || '').includes(needle)) return true;
  }

  for (const row of certs || []) {
    const pathFromUrl = extractStorageRelativePath(row.file_url || '');
    if (pathFromUrl && normalizeRelative(pathFromUrl) === needle) return true;
    if ((row.file_url || '').includes(needle)) return true;
  }

  const companyName = client?.company_name || 'client';
  const folder = await resolveClientStorageFolder(admin, clientId, companyName);
  const first = needle.split('/').filter(Boolean)[0] || '';
  return Boolean(folder && first && first === folder);
}

/** Serve certificate/PO files from disk. Requires a signed-in session. */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { path: parts } = await context.params;
  const relative = resolveSafeRelative(parts || []);
  if (!relative) {
    return NextResponse.json({ error: 'Invalid path.' }, { status: 400 });
  }

  const isAdmin = session.role === 'MASTER_ADMIN' || session.role === 'SUPER_ADMIN';
  if (!isAdmin) {
    if (!session.clientId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const allowed = await clientOwnsRelativePath(session.clientId, relative);
    if (!allowed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
  }

  let diskPath = resolveCertificatesFilePath(relative);
  // Basename search can hit another client's file — only allow for admins.
  if (!diskPath && isAdmin) {
    const baseName = path.basename(relative);
    diskPath = findCertificatesFileByNames([baseName]);
  }

  if (!diskPath) {
    return NextResponse.json({ error: 'File not found.' }, { status: 404 });
  }

  try {
    const buffer = await fs.readFile(diskPath);
    const fileName = path.basename(diskPath);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': guessContentType(fileName),
        'Content-Length': String(buffer.length),
        'Content-Disposition': `inline; filename="${fileName.replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch {
    return NextResponse.json({ error: 'File not found.' }, { status: 404 });
  }
}
