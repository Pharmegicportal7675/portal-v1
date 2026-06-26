function parseIsoDate(value: string): Date | null {
  const raw = value.trim().split('T')[0];
  if (!raw) return null;
  const parsed = new Date(`${raw}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function yearFromIso(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = parseIsoDate(value);
  return parsed ? parsed.getFullYear() : null;
}

/** Calendar year used for TCC validity (export year first, then issue year). */
export function resolveTccCertificateYear(
  exportDate?: string | null,
  issueDate?: string | null
): number {
  return (
    yearFromIso(exportDate) ??
    yearFromIso(issueDate) ??
    new Date().getFullYear()
  );
}

/** Default Valid Upto: 31 December of the TCC year. */
export function getTccCertificateValidUntilIso(
  exportDate?: string | null,
  issueDate?: string | null
): string {
  const year = resolveTccCertificateYear(exportDate, issueDate);
  return `${year}-12-31`;
}

/** Prefer stored valid-until (application or certificate), else default year-end. */
export function resolveTccValidUntilIso(options: {
  validUntilDate?: string | null;
  exportDate?: string | null;
  issueDate?: string | null;
  certExpiresAt?: string | null;
}): string {
  if (options.certExpiresAt?.trim()) {
    return options.certExpiresAt.trim().split('T')[0];
  }
  if (options.validUntilDate?.trim()) {
    return options.validUntilDate.trim().split('T')[0];
  }
  return getTccCertificateValidUntilIso(options.exportDate, options.issueDate);
}

/** Date of Issue on the TCC certificate — PO date first, then explicit issue date. */
export function resolveTccCertificateDateOfIssue(options: {
  poDate?: string | null;
  issuedDate?: string | null;
}): string {
  const poDate = options.poDate?.trim();
  if (poDate) return poDate.split('T')[0];
  const issuedDate = options.issuedDate?.trim();
  if (issuedDate) return issuedDate.split('T')[0];
  return new Date().toISOString().split('T')[0];
}

export function getTccCertificateValidUntilDate(
  exportDate?: string | null,
  issueDate?: string | null
): Date {
  return new Date(`${getTccCertificateValidUntilIso(exportDate, issueDate)}T12:00:00`);
}
