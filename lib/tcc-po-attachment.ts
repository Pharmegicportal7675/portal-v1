import 'server-only';

import path from 'node:path';
import { createAdminClient } from '@/lib/db/admin';
import { CERTIFICATES_BUCKET } from '@/lib/storage';
import {
  extractStorageRelativePath,
  transformLegacyStorageRelativePath,
} from '@/lib/storage-paths';

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

function candidateStoragePaths(publicUrl: string | null | undefined): string[] {
  if (!publicUrl?.trim()) return [];

  const relative = extractStorageRelativePath(publicUrl);
  const paths = new Set<string>();

  if (relative) {
    paths.add(relative);
    const transformed = transformLegacyStorageRelativePath(relative);
    if (transformed) paths.add(transformed);

    try {
      const decoded = decodeURIComponent(relative);
      if (decoded !== relative) paths.add(decoded);
    } catch {
      // ignore malformed encoding
    }
  }

  return [...paths];
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

  const candidates = candidateStoragePaths(app.bo_attachment_url);
  if (candidates.length === 0) {
    return { ok: false, error: 'PO attachment path could not be resolved.', status: 404 };
  }

  let lastError = 'PO attachment file was not found on the server.';
  for (const storagePath of candidates) {
    const { data, error: downloadError } = await adminSupabase.storage
      .from(CERTIFICATES_BUCKET)
      .download(storagePath);

    if (downloadError || !data) {
      lastError = downloadError?.message || lastError;
      continue;
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    const fileName =
      app.bo_attachment_name?.trim() || path.basename(storagePath) || 'po-attachment';

    return {
      ok: true,
      clientId: app.client_id,
      file: {
        buffer,
        fileName,
        contentType: guessContentType(fileName),
      },
    };
  }

  return { ok: false, error: lastError, status: 404 };
}
