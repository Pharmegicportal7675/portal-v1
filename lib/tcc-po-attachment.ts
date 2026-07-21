import 'server-only';

import fs from 'node:fs/promises';
import path from 'node:path';
import { createAdminClient } from '@/lib/db/admin';
import { CERTIFICATES_BUCKET } from '@/lib/storage';
import {
  findCertificatesFileByNames,
  resolveCertificatesFilePath,
} from '@/lib/certificates-upload-root';
import {
  collectPoAttachmentRelativePaths,
  sanitizePoAttachmentError,
} from '@/lib/tcc-po-attachment-paths';
import { normalizePoAttachmentPublicUrl } from '@/lib/tcc-po-attachment-url';

export type PoAttachmentFile = {
  buffer: Buffer;
  fileName: string;
  contentType: string;
};

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
    case 'ppt':
      return 'application/vnd.ms-powerpoint';
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    default:
      return 'application/octet-stream';
  }
}

const DEFAULT_PO_ATTACHMENT_ORIGIN = 'https://portal.pharmegichealthcare.com';

function getRemotePoAttachmentOrigin(): string | undefined {
  return (
    process.env.PO_ATTACHMENTS_REMOTE_ORIGIN?.trim()?.replace(/\/$/, '') ||
    process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/$/, '') ||
    DEFAULT_PO_ATTACHMENT_ORIGIN
  );
}

function getPoAttachmentFetchOrigins(): string[] {
  const port = process.env.PORT || '3000';
  const localOrigins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  const remoteOrigin = getRemotePoAttachmentOrigin();
  const internalOrigin = process.env.INTERNAL_APP_ORIGIN?.trim()?.replace(/\/$/, '');

  // Local dev often uses the live DB while files stay on production disk.
  if (process.env.NODE_ENV === 'development') {
    return [
      ...new Set(
        [remoteOrigin, internalOrigin, ...localOrigins].filter(
          (value): value is string => Boolean(value)
        )
      ),
    ];
  }

  return [
    ...new Set(
      [internalOrigin, remoteOrigin, ...localOrigins].filter(
        (value): value is string => Boolean(value)
      )
    ),
  ];
}

async function fetchPoAttachmentViaPublicUrl(storedUrl: string): Promise<Buffer | null> {
  const publicPath = normalizePoAttachmentPublicUrl(storedUrl);
  if (!publicPath) return null;

  for (const base of getPoAttachmentFetchOrigins()) {
    try {
      const response = await fetch(`${base}${publicPath}`, { cache: 'no-store' });
      if (!response.ok) continue;
      return Buffer.from(await response.arrayBuffer());
    } catch {
      // try next origin
    }
  }

  return null;
}

async function readPoAttachmentFile(
  storagePath: string,
  fallbackFileName: string
): Promise<PoAttachmentFile | null> {
  const diskPath = resolveCertificatesFilePath(storagePath);
  if (diskPath) {
    const buffer = await fs.readFile(diskPath);
    const fileName = fallbackFileName.trim() || path.basename(diskPath) || 'po-attachment';
    return {
      buffer,
      fileName,
      contentType: guessContentType(fileName),
    };
  }

  const adminSupabase = createAdminClient();
  const { data, error: downloadError } = await adminSupabase.storage
    .from(CERTIFICATES_BUCKET)
    .download(storagePath);

  if (downloadError || !data) {
    return null;
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const fileName = fallbackFileName.trim() || path.basename(storagePath) || 'po-attachment';
  return {
    buffer,
    fileName,
    contentType: guessContentType(fileName),
  };
}

export async function loadPoAttachmentForApplication(
  applicationId: string
): Promise<
  | { ok: true; file: PoAttachmentFile; clientId: string }
  | { ok: false; error: string; status: number }
> {
  const adminSupabase = createAdminClient();
  const { data: app, error } = await adminSupabase
    .from('tcc_applications')
    .select('id, client_id, bo_attachment_url, bo_attachment_name')
    .eq('id', applicationId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message || 'Failed to load application.', status: 500 };
  }
  if (!app) {
    return { ok: false, error: 'Application not found.', status: 404 };
  }
  if (!app.bo_attachment_url) {
    return { ok: false, error: 'No PO attachment uploaded for this application.', status: 404 };
  }

  const candidates = collectPoAttachmentRelativePaths(app.bo_attachment_url);
  if (candidates.length === 0) {
    return { ok: false, error: 'PO attachment path could not be resolved.', status: 404 };
  }

  const fallbackName =
    app.bo_attachment_name?.trim() ||
    path.basename(candidates[0] || '') ||
    'po-attachment';

  // Fast path for production: static file is often served even when Node cwd differs.
  const httpBufferEarly = await fetchPoAttachmentViaPublicUrl(app.bo_attachment_url);
  if (httpBufferEarly) {
    return {
      ok: true,
      clientId: app.client_id,
      file: {
        buffer: httpBufferEarly,
        fileName: fallbackName,
        contentType: guessContentType(fallbackName),
      },
    };
  }

  for (const storagePath of candidates) {
    try {
      const file = await readPoAttachmentFile(storagePath, fallbackName);
      if (file) {
        return {
          ok: true,
          clientId: app.client_id,
          file,
        };
      }
    } catch {
      // try next candidate
    }
  }

  const searchNames = [
    fallbackName,
    app.bo_attachment_name?.trim(),
    path.basename(candidates[0] || ''),
    path.basename(app.bo_attachment_url.split('?')[0] || ''),
  ].filter((value): value is string => Boolean(value?.trim()));

  const discovered = findCertificatesFileByNames(searchNames);
  if (discovered) {
    try {
      const buffer = await fs.readFile(discovered);
      return {
        ok: true,
        clientId: app.client_id,
        file: {
          buffer,
          fileName: fallbackName,
          contentType: guessContentType(fallbackName),
        },
      };
    } catch {
      // fall through
    }
  }

  return {
    ok: false,
    error: sanitizePoAttachmentError('ENOENT: PO attachment file was not found on the server.'),
    status: 404,
  };
}

/** True when the application has a PO URL and the file can be read from disk/HTTP. */
export async function isPoAttachmentFileAvailable(applicationId: string): Promise<boolean> {
  const result = await loadPoAttachmentForApplication(applicationId);
  return result.ok;
}
