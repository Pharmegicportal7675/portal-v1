export const REACH_CERTIFICATE_TYPE = 'REACH';

export const RC_CERTIFICATE_YEAR_MIN = 2020;
export const RC_CERTIFICATE_YEAR_MAX = 2045;

export function getRcCertificateYearRange(): number[] {
  return Array.from(
    { length: RC_CERTIFICATE_YEAR_MAX - RC_CERTIFICATE_YEAR_MIN + 1 },
    (_, index) => RC_CERTIFICATE_YEAR_MIN + index
  );
}

export function buildRcCertificateYearOptions(): { value: string; label: string }[] {
  return getRcCertificateYearRange().map((year) => ({
    value: String(year),
    label: String(year),
  }));
}

export function isReachCertificateType(cert: {
  type?: string | null;
  certificate_number?: string | null;
}): boolean {
  const type = cert.type?.trim().toUpperCase();
  if (type === REACH_CERTIFICATE_TYPE || type === 'RC') return true;
  const number = cert.certificate_number?.trim().toUpperCase() ?? '';
  return number.startsWith('RC-');
}

export function getLatestReachCertForChemical(
  certificates: ReachCertificateRecord[],
  chemicalId: string,
  casNumber?: string | null,
  registrationNumber?: string | null,
  certificateNumber?: string | null
): ReachCertificateRecord | null {
  const matches = getReachCertsForClientChemical(
    certificates,
    chemicalId,
    casNumber,
    registrationNumber,
    certificateNumber
  );
  return matches[0] ?? null;
}

export type ReachCertificateRecord = {
  id: string;
  certificate_number: string;
  registration_number?: string | null;
  chemical_id?: string | null;
  issued_at: string;
  expires_at: string | null;
  status: string;
  file_url?: string | null;
  type?: string | null;
  allocated_quantity?: number | null;
  tonnage_band?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

export function isActiveReachCertificate(
  cert: ReachCertificateRecord | null | undefined,
  asOf: Date = new Date()
): boolean {
  if (!cert) return false;
  if (cert.type && !isReachCertificateType(cert)) return false;
  if (cert.status !== 'active') return false;
  if (!cert.expires_at) return false;
  return new Date(cert.expires_at) > asOf;
}

function certLinkedChemicalMeta(cert: ReachCertificateRecord) {
  const chem =
    (cert as { chemicals?: { cas_number?: string | null; chemical_name?: string | null } }).chemicals ??
    (cert as { chemical?: { cas_number?: string | null; chemical_name?: string | null } }).chemical;
  return {
    cas: chem?.cas_number?.trim().toLowerCase() ?? '',
    name: chem?.chemical_name?.trim().toLowerCase() ?? '',
  };
}

export function getReachCertificateStatus(
  cert: ReachCertificateRecord | null | undefined,
  asOf: Date = new Date()
): 'valid' | 'expired' | 'revoked' | 'missing' {
  if (!cert) return 'missing';
  if (cert.status === 'revoked') return 'revoked';
  if (!cert.expires_at || new Date(cert.expires_at) <= asOf) return 'expired';
  if (cert.status === 'active') return 'valid';
  return 'expired';
}

/** RC badge status for substance table — falls back to client_chemicals.validity_date when no cert exists. */
export function getSubstanceRcBadgeStatus(
  cert: ReachCertificateRecord | null | undefined,
  validityDate: string | null | undefined,
  asOf: Date = new Date()
): 'valid' | 'expired' | 'revoked' | 'missing' {
  if (cert) return getReachCertificateStatus(cert, asOf);
  if (validityDate?.trim()) {
    const end = endOfDay(new Date(validityDate.trim().split('T')[0] + 'T12:00:00'));
    if (!Number.isNaN(end.getTime()) && end < asOf) return 'expired';
  }
  return 'missing';
}

export function hasNewerReachCertificate(
  certs: ReachCertificateRecord[],
  cert: ReachCertificateRecord
): boolean {
  const issuedAt = new Date(cert.issued_at).getTime();
  return certs.some(
    (other) => other.id !== cert.id && new Date(other.issued_at).getTime() > issuedAt
  );
}

/** True when admin may issue a renewed RC (no active cert; at least one expired or past validity). */
export function canRenewReachForChemical(
  certs: ReachCertificateRecord[],
  validityDate: string | null | undefined
): boolean {
  if (certs.some((c) => isActiveReachCertificate(c))) return false;
  if (certs.some((c) => getReachCertificateStatus(c) === 'expired')) return true;
  return getSubstanceRcBadgeStatus(null, validityDate) === 'expired';
}

/** Latest REACH certificate per chemical_id for a client. */
export function mapLatestReachByChemical(
  certificates: ReachCertificateRecord[]
): Map<string, ReachCertificateRecord> {
  const map = new Map<string, ReachCertificateRecord>();
  for (const cert of certificates) {
    if (!isReachCertificateType(cert) || !cert.chemical_id) continue;
    const existing = map.get(cert.chemical_id);
    if (!existing || new Date(cert.issued_at) > new Date(existing.issued_at)) {
      map.set(cert.chemical_id, cert);
    }
  }
  return map;
}

/** All REACH certificates grouped by chemical_id (newest first per chemical). */
export function mapAllReachByChemical(
  certificates: ReachCertificateRecord[]
): Map<string, ReachCertificateRecord[]> {
  const map = new Map<string, ReachCertificateRecord[]>();
  for (const cert of certificates) {
    if (!isReachCertificateType(cert) || !cert.chemical_id) continue;
    if (cert.status === 'revoked') continue;
    const list = map.get(cert.chemical_id) ?? [];
    list.push(cert);
    map.set(cert.chemical_id, list);
  }
  for (const [chemicalId, list] of map) {
    list.sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime());
    map.set(chemicalId, list);
  }
  return map;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Whether a calendar date falls within an RC validity window (inclusive). */
export function isDateInReachWindow(
  date: string | Date,
  issuedAt: string,
  expiresAt: string | null
): boolean {
  const d = startOfDay(new Date(date));
  const issued = startOfDay(new Date(issuedAt));
  if (d < issued) return false;
  if (!expiresAt) return true;
  const expires = endOfDay(new Date(expiresAt));
  return d <= expires;
}

/** RC certificate whose validity window contains the export shipment date. */
export function findReachCertificateForExportDate(
  certificates: ReachCertificateRecord[],
  chemicalId: string,
  exportDate: string | Date
): ReachCertificateRecord | null {
  const matches = certificates
    .filter(
      (cert) =>
        cert.chemical_id === chemicalId &&
        isReachCertificateType(cert) &&
        cert.status !== 'revoked' &&
        isDateInReachWindow(exportDate, cert.issued_at, cert.expires_at)
    )
    .sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime());

  return matches[0] ?? null;
}

export function doReachValidityPeriodsOverlap(
  issuedA: string | Date,
  expiresA: string | Date | null,
  issuedB: string | Date,
  expiresB: string | Date | null
): boolean {
  const startA = startOfDay(new Date(issuedA)).getTime();
  const endA = expiresA ? endOfDay(new Date(expiresA)).getTime() : Number.POSITIVE_INFINITY;
  const startB = startOfDay(new Date(issuedB)).getTime();
  const endB = expiresB ? endOfDay(new Date(expiresB)).getTime() : Number.POSITIVE_INFINITY;
  return startA <= endB && startB <= endA;
}

export function normalizeCertDate(value: string | null | undefined): string {
  if (!value?.trim()) return '';
  return value.trim().split('T')[0];
}

/** True when the given cert is the newest RC for its chemical (sorted list expected newest first). */
export function isLatestReachCertificate(
  certs: ReachCertificateRecord[],
  cert: ReachCertificateRecord
): boolean {
  if (certs.length === 0) return true;
  return certs[0].id === cert.id;
}

/** Block duplicate calendar-year RC entries for the same chemical. */
export function findReachCertificateYearConflict(
  certificates: ReachCertificateRecord[],
  chemicalId: string,
  year: number,
  chemicalName: string,
  casNumber?: string | null,
  registrationNumber?: string | null,
  excludeCertId?: string | null
): string | null {
  const siblings = getReachCertsForClientChemical(
    certificates,
    chemicalId,
    casNumber,
    registrationNumber,
    undefined,
    chemicalName
  ).filter((cert) => !excludeCertId || cert.id !== excludeCertId);

  for (const existing of siblings) {
    const existingYear = getReachCertificateYear(existing.issued_at);
    if (existingYear === year) {
      return `Certificate already exists for selected Substance and Year (${chemicalName} — ${year}).`;
    }
  }

  return null;
}

/** All non-revoked RC certificates linked to a client substance (by chemical_id, CAS, name, registration, or cert number). */
export function getReachCertsForClientChemical(
  certificates: ReachCertificateRecord[],
  chemicalId: string,
  casNumber?: string | null,
  registrationNumber?: string | null,
  certificateNumber?: string | null,
  chemicalName?: string | null
): ReachCertificateRecord[] {
  const isEligible = (cert: ReachCertificateRecord) =>
    isReachCertificateType(cert) && cert.status !== 'revoked';

  const byChemicalId = certificates.filter(
    (cert) => isEligible(cert) && cert.chemical_id === chemicalId
  );

  const cas = casNumber?.trim().toLowerCase();
  const name = chemicalName?.trim().toLowerCase();
  const reg = registrationNumber?.trim().toLowerCase();
  const certNum = certificateNumber?.trim().toLowerCase();
  const seen = new Set(byChemicalId.map((cert) => cert.id));

  const byCasRegNameOrNumber = certificates.filter((cert) => {
    if (!isEligible(cert) || seen.has(cert.id)) return false;
    const meta = certLinkedChemicalMeta(cert);
    const certReg = cert.registration_number?.trim().toLowerCase() ?? '';
    const certNo = cert.certificate_number?.trim().toLowerCase() ?? '';
    const sameChemical = cert.chemical_id === chemicalId;
    const sameCas = Boolean(cas && meta.cas && meta.cas === cas);
    const sameName = Boolean(name && meta.name && meta.name === name);

    if (sameChemical) return true;
    if (sameCas) return true;
    if (sameName) return true;
    if (reg && certReg && certReg === reg && (sameCas || sameName || sameChemical)) return true;
    if (certNum && certNo && certNo === certNum && (sameChemical || sameCas)) return true;
    return false;
  });

  return [...byChemicalId, ...byCasRegNameOrNumber].sort(
    (a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime()
  );
}

/** Find an existing RC certificate with the exact same validity period for a substance. */
export function findExactReachCertForPeriod(
  certificates: ReachCertificateRecord[],
  chemicalId: string,
  issuedDate: string,
  validatedDate: string,
  casNumber?: string | null,
  registrationNumber?: string | null,
  chemicalName?: string | null
): ReachCertificateRecord | null {
  const newIssue = normalizeCertDate(issuedDate);
  const newExpiry = normalizeCertDate(validatedDate);
  const siblings = getReachCertsForClientChemical(
    certificates,
    chemicalId,
    casNumber,
    registrationNumber,
    undefined,
    chemicalName
  );

  return (
    siblings.find((cert) => {
      const existIssue = normalizeCertDate(cert.issued_at);
      const existExpiry = normalizeCertDate(cert.expires_at);
      return existIssue === newIssue && existExpiry === newExpiry;
    }) ?? null
  );
}

/** Returns an error message when dates duplicate or overlap an existing RC cert for the same chemical. */
export function findReachCertificatePeriodConflict(
  certificates: ReachCertificateRecord[],
  chemicalId: string,
  chemicalName: string,
  issuedDate: string,
  validatedDate: string,
  excludeCertId?: string | null,
  casNumber?: string | null,
  registrationNumber?: string | null
): string | null {
  const newIssue = normalizeCertDate(issuedDate);
  const newExpiry = normalizeCertDate(validatedDate);

  const siblings = getReachCertsForClientChemical(
    certificates,
    chemicalId,
    casNumber,
    registrationNumber,
    undefined,
    chemicalName
  ).filter((cert) => !excludeCertId || cert.id !== excludeCertId);

  for (const existing of siblings) {
    const existIssue = normalizeCertDate(existing.issued_at);
    const existExpiry = normalizeCertDate(existing.expires_at);
    const certLabel = existing.certificate_number?.trim() || existing.id;

    if (existIssue === newIssue && existExpiry === newExpiry) {
      return `Certificate ${certLabel} already uses issue date ${existIssue} and expiry date ${existExpiry} for ${chemicalName}. It is listed under CT Certificates — delete it there or choose different dates.`;
    }

    if (
      doReachValidityPeriodsOverlap(
        issuedDate,
        validatedDate,
        existing.issued_at,
        existing.expires_at
      )
    ) {
      return `Certificate ${certLabel} already covers ${existIssue} to ${existExpiry || 'open'} for ${chemicalName}. Choose non-overlapping dates or delete ${certLabel} from CT Certificates.`;
    }
  }

  return null;
}

export function addOneYear(from: Date = new Date()): Date {
  const expiry = new Date(from);
  expiry.setFullYear(expiry.getFullYear() + 1);
  return expiry;
}

/** YYYY-MM-DD for January 1 of the given year (defaults to current year). */
export function getFirstDateOfYear(year: number = new Date().getFullYear()): string {
  return `${year}-01-01`;
}

/** YYYY-MM-DD for December 31 of the given year (defaults to current year). */
export function getLastDateOfYear(year: number = new Date().getFullYear()): string {
  return `${year}-12-31`;
}

/** Calendar year from an RC certificate issue date. */
export function getReachCertificateYear(issuedAt: string | null | undefined): number | null {
  if (!issuedAt?.trim()) return null;
  const year = new Date(issuedAt.trim().split('T')[0] + 'T12:00:00').getFullYear();
  return Number.isNaN(year) ? null : year;
}

/** Default RC validity period for a calendar year. */
export function getDefaultReachPeriodForYear(year: number = new Date().getFullYear()) {
  return {
    issuedDate: getFirstDateOfYear(year),
    validatedDate: getLastDateOfYear(year),
  };
}

/** YYYY-MM-DD for today (local date). */
export function getTodayDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Suggest the next calendar-year RC period when renewing. */
export function suggestRenewCertificateDates(
  latestCert: ReachCertificateRecord | null | undefined,
  fallbackValidity?: string | null
): { issuedDate: string; validatedDate: string } {
  const expiryYear =
    getReachCertificateYear(latestCert?.expires_at) ??
    getReachCertificateYear(fallbackValidity) ??
    new Date().getFullYear();
  return getDefaultReachPeriodForYear(expiryYear + 1);
}
