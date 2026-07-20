import { CERTIFICATES_UPLOAD_URL_MARKER } from '@/lib/storage-paths';

/** Auth-protected API route (download / fallback when static path is unavailable). */
export function buildPoAttachmentApiUrl(applicationId: string): string {
  return `/api/tcc/po-attachment?id=${encodeURIComponent(applicationId)}`;
}

/** Same-origin static path from a stored PO URL, when available. */
export function normalizePoAttachmentPublicUrl(storedUrl: string | null | undefined): string | null {
  if (!storedUrl?.trim()) return null;
  const trimmed = storedUrl.trim();

  if (trimmed.startsWith(CERTIFICATES_UPLOAD_URL_MARKER)) {
    return trimmed.split('?')[0] || null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname.startsWith(CERTIFICATES_UPLOAD_URL_MARKER)) {
      return parsed.pathname;
    }
  } catch {
    // not an absolute URL
  }

  return null;
}

/** Use auth-protected API for in-app preview (works local + live when static /uploads is missing). */
export function buildPoAttachmentPreviewUrl(
  applicationId: string | undefined,
  storedUrl: string | null | undefined
): string | null {
  if (applicationId) return buildPoAttachmentApiUrl(applicationId);
  const publicUrl = normalizePoAttachmentPublicUrl(storedUrl);
  if (publicUrl) return publicUrl;
  return storedUrl?.trim() || null;
}
