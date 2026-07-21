import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  findCertificatesFileByNames,
  resolveCertificatesFilePath,
} from '@/lib/certificates-upload-root';

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

/** Serve certificate/PO files from disk (standalone public/uploads is often empty on Hostinger). */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path: parts } = await context.params;
  const relative = resolveSafeRelative(parts || []);
  if (!relative) {
    return NextResponse.json({ error: 'Invalid path.' }, { status: 400 });
  }

  let diskPath = resolveCertificatesFilePath(relative);
  if (!diskPath) {
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
