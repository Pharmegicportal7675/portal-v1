import { CERTIFICATES_BUCKET } from '@/lib/storage';
import {
  CERTIFICATES_UPLOAD_URL_MARKER,
  extractStorageRelativePath,
  transformLegacyStorageRelativePath,
} from '@/lib/storage-paths';

/** Collect relative storage paths for a PO attachment URL stored in the DB. */
export function collectPoAttachmentRelativePaths(publicUrl: string | null | undefined): string[] {
  if (!publicUrl?.trim()) return [];

  const paths = new Set<string>();
  const trimmed = publicUrl.trim();

  const fromUploads = extractStorageRelativePath(trimmed);
  if (fromUploads) {
    paths.add(fromUploads);
    const transformed = transformLegacyStorageRelativePath(fromUploads);
    if (transformed) paths.add(transformed);

    try {
      const decoded = decodeURIComponent(fromUploads);
      if (decoded !== fromUploads) paths.add(decoded);
    } catch {
      // ignore malformed encoding
    }
  }

  const markers = [
    CERTIFICATES_UPLOAD_URL_MARKER,
    `/object/public/${CERTIFICATES_BUCKET}/`,
    `/${CERTIFICATES_BUCKET}/`,
  ];

  for (const marker of markers) {
    const idx = trimmed.indexOf(marker);
    if (idx >= 0) {
      const relative = decodeURIComponent(trimmed.slice(idx + marker.length).split('?')[0] ?? '')
        .replace(/^\/+/, '')
        .trim();
      if (relative) {
        paths.add(relative);
        const transformed = transformLegacyStorageRelativePath(relative);
        if (transformed) paths.add(transformed);
      }
    }
  }

  const boIdx = trimmed.indexOf('/bo/');
  if (boIdx >= 0) {
    const legacy = decodeURIComponent(trimmed.slice(boIdx + 1).split('?')[0] ?? '')
      .replace(/^\/+/, '')
      .trim();
    if (legacy) {
      paths.add(legacy);
      const transformed = transformLegacyStorageRelativePath(legacy);
      if (transformed) paths.add(transformed);
    }
  }

  return [...paths];
}

export function sanitizePoAttachmentError(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return 'PO attachment file was not found on the server.';

  if (/ENOENT|no such file or directory/i.test(trimmed)) {
    return 'PO attachment file was not found on the server. The file may have been lost during a server deployment — check Hostinger backups or ask the client to re-upload the PO.';
  }

  if (trimmed.length > 180) {
    return 'PO attachment could not be loaded.';
  }

  return trimmed;
}
