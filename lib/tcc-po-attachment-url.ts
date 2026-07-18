/** Client-safe helper — PO attachment preview/download URL. */
export function buildPoAttachmentApiUrl(applicationId: string): string {
  return `/api/tcc/po-attachment?id=${encodeURIComponent(applicationId)}`;
}
