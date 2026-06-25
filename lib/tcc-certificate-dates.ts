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

export function getTccCertificateValidUntilDate(
  exportDate?: string | null,
  issueDate?: string | null
): Date {
  return new Date(`${getTccCertificateValidUntilIso(exportDate, issueDate)}T12:00:00`);
}
