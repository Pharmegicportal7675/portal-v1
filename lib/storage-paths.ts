export type StorageFolder = 'PO' | 'RC' | 'TCC';

/** @deprecated Use StorageFolder — kept for existing call sites. */
export type StorageCategory = 'bo' | 'rc' | 'tcc';

export const CERTIFICATES_UPLOAD_URL_MARKER = '/uploads/certificates/';

const LEGACY_CATEGORY_MAP: Record<StorageCategory, StorageFolder> = {
  bo: 'PO',
  rc: 'RC',
  tcc: 'TCC',
};

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

/** Calendar year (YYYY) from an ISO date, export date, or today. */
export function formatStorageYearFolder(date?: string | Date | null): string {
  if (!date) {
    return String(new Date().getFullYear());
  }

  if (date instanceof Date) {
    return Number.isNaN(date.getTime())
      ? String(new Date().getFullYear())
      : String(date.getFullYear());
  }

  const value = String(date).trim();
  const yearMatch = value.match(/^(\d{4})/);
  if (yearMatch) return yearMatch[1];

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return String(parsed.getFullYear());
  }

  return String(new Date().getFullYear());
}

/**
 * Build storage path:
 * `{ClientName}/{Year}/{PO|RC|TCC}/{fileName}`
 */
export function buildClientYearStoragePath(
  folder: StorageFolder,
  clientName: string,
  date: string | Date | null | undefined,
  fileName: string
): string {
  const safeClient = sanitizeStorageFolderName(clientName);
  const yearFolder = formatStorageYearFolder(date);
  const safeFile = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${safeClient}/${yearFolder}/${folder}/${safeFile}`;
}

/** @deprecated Prefer buildClientYearStoragePath — maps bo/rc/tcc to PO/RC/TCC. */
export function buildClientDateStoragePath(
  category: StorageCategory,
  clientName: string,
  date: string | Date | null | undefined,
  fileName: string
): string {
  return buildClientYearStoragePath(LEGACY_CATEGORY_MAP[category], clientName, date, fileName);
}

/** Map legacy relative paths to the new layout, or null if already current / unknown. */
export function transformLegacyStorageRelativePath(relative: string): string | null {
  const normalized = relative.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized) return null;

  const segments = normalized.split('/');
  if (segments.length >= 4) {
    const [head, client, dateOrYear, ...rest] = segments;
    const file = rest[rest.length - 1];
    const middle = rest.slice(0, -1);

    if (head === 'bo' && middle.length === 0) {
      return `${client}/${formatStorageYearFolder(dateOrYear)}/PO/${file}`;
    }
    if (head === 'rc' && middle.length === 0) {
      return `${client}/${formatStorageYearFolder(dateOrYear)}/RC/${file}`;
    }
    if (head === 'tcc' && middle.length === 0) {
      return `${client}/${formatStorageYearFolder(dateOrYear)}/TCC/${file}`;
    }
  }

  // Already in new layout: Client/Year/PO|RC|TCC/file
  if (
    segments.length === 4 &&
    /^\d{4}$/.test(segments[1]) &&
    (segments[2] === 'PO' || segments[2] === 'RC' || segments[2] === 'TCC')
  ) {
    return null;
  }

  return null;
}

export function buildPoStoragePath(
  clientName: string,
  folderDate: string | Date | null | undefined,
  originalFileName: string
): string {
  const safeName = originalFileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return buildClientYearStoragePath('PO', clientName, folderDate, safeName);
}

/** @deprecated Use buildPoStoragePath */
export function buildBoStoragePath(
  clientName: string,
  folderDate: string | Date | null | undefined,
  originalFileName: string
): string {
  return buildPoStoragePath(clientName, folderDate, originalFileName);
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
