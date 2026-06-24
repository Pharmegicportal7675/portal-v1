export type StorageCategory = 'bo' | 'rc' | 'tcc';

export const CERTIFICATES_UPLOAD_URL_MARKER = '/uploads/certificates/';

/** Safe folder segment from company / client name. */
export function sanitizeStorageFolderName(name: string): string {
  const slug = (name || 'unknown-client')
    .trim()
    .replace(/[^a-zA-Z0-9._\s-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);

  return slug || 'unknown-client';
}

/** YYYY-MM-DD folder name from an ISO date, export date, or today. */
export function formatStorageDateFolder(date?: string | Date | null): string {
  if (!date) {
    return new Date().toISOString().slice(0, 10);
  }

  if (date instanceof Date) {
    return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
  }

  const value = String(date).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return new Date().toISOString().slice(0, 10);
}

export function buildClientDateStoragePath(
  category: StorageCategory,
  clientName: string,
  date: string | Date | null | undefined,
  fileName: string
): string {
  const safeClient = sanitizeStorageFolderName(clientName);
  const dateFolder = formatStorageDateFolder(date);
  const safeFile = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${category}/${safeClient}/${dateFolder}/${safeFile}`;
}

export function buildBoStoragePath(
  clientName: string,
  folderDate: string | Date | null | undefined,
  originalFileName: string
): string {
  const safeName = originalFileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return buildClientDateStoragePath('bo', clientName, folderDate, `${Date.now()}-${safeName}`);
}

/** Relative storage path from a public file URL (supports nested folders). */
export function extractStorageRelativePath(fileUrl: string): string | null {
  const trimmed = fileUrl.trim();
  if (!trimmed) return null;

  const markerIndex = trimmed.indexOf(CERTIFICATES_UPLOAD_URL_MARKER);
  if (markerIndex !== -1) {
    const relative = trimmed.slice(markerIndex + CERTIFICATES_UPLOAD_URL_MARKER.length).split('?')[0];
    return decodeURIComponent(relative) || null;
  }

  try {
    const pathname = new URL(trimmed).pathname;
    const pathMarker = pathname.indexOf(CERTIFICATES_UPLOAD_URL_MARKER);
    if (pathMarker !== -1) {
      return decodeURIComponent(pathname.slice(pathMarker + CERTIFICATES_UPLOAD_URL_MARKER.length)) || null;
    }
    const base = pathname.split('/').pop();
    return base || null;
  } catch {
    const parts = trimmed.split('/');
    return parts[parts.length - 1] || null;
  }
}
