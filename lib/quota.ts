import {
  findReachCertificateForExportDate,
  isDateInReachWindow,
  type ReachCertificateRecord,
} from '@/lib/reach-certificate';

/** Export tonnage is stored and calculated to this many decimal places (for example 1.00056). */
export const QUANTITY_MT_DECIMALS = 6;

const QUANTITY_MT_FACTOR = 10 ** QUANTITY_MT_DECIMALS;
const QUANTITY_MT_PATTERN = /^\d+(\.\d{1,6})?$/;

export function roundQuantityMt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * QUANTITY_MT_FACTOR) / QUANTITY_MT_FACTOR;
}

/** Accepts a positive metric-ton value with up to 6 decimal places. */
export function parseQuantityMt(value: unknown): number | null {
  const raw = String(value ?? '').trim();
  if (!QUANTITY_MT_PATTERN.test(raw)) return null;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric;
}

/** Shows 1.01 as 1.01 and 1.00056 as 1.00056. */
export function formatQuantityMt(value: number | string | null | undefined): string {
  const numeric = roundQuantityMt(Number(value));
  if (!Number.isFinite(numeric)) return '0';
  return numeric.toFixed(QUANTITY_MT_DECIMALS).replace(/\.?0+$/, '');
}

const TONNAGE_BAND_QUOTA: Record<string, number> = {
  '1-10 tonnes': 10,
  '10-100 tonnes': 100,
  '100-1000 tonnes': 1000,
  '1-1000 tonnes': 1000,
  '1000+ tonnes': 20000,
};

/** Prefer certificate tonnage, then chemical registry band; empty → fallback (default "None"). */
export function resolveDisplayedTonnageBand(
  certTonnage?: string | null,
  chemicalTonnage?: string | null,
  fallback = 'None'
): string {
  const fromCert = certTonnage?.trim();
  if (fromCert) return fromCert;
  const fromChem = chemicalTonnage?.trim();
  if (fromChem) return fromChem;
  return fallback;
}

export type TccExportRecord = {
  id?: string;
  chemical_id?: string;
  quantity_mt?: number | string | null;
  status?: string;
  export_date?: string | null;
  reach_certificate_id?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  certificates?:
    | { issued_at?: string | null }
    | { issued_at?: string | null }[]
    | null;
};

export function getTonnageBandMaxQuota(tonnageBand: string | null | undefined): number | null {
  if (!tonnageBand?.trim()) return null;

  const known = TONNAGE_BAND_QUOTA[tonnageBand.trim()];
  if (known != null) return known;

  const rangeMatch = tonnageBand.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  if (rangeMatch) return Number(rangeMatch[2]);

  const plusMatch = tonnageBand.match(/(\d+(?:\.\d+)?)\s*\+/);
  if (plusMatch) return Number(plusMatch[1]);

  return null;
}

function getTccCertificateDate(app: TccExportRecord): Date | null {
  const cert = app.certificates;
  const resolved = Array.isArray(cert) ? cert[0] : cert;
  const raw = resolved?.issued_at || app.export_date || app.updated_at || app.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Sum approved certificate tonnage for a chemical, optionally filtered to a calendar year. */
export function sumApprovedExports(
  applications: TccExportRecord[],
  chemicalId: string,
  year: number | null = new Date().getFullYear()
): number {
  return applications
    .filter((app) => app.chemical_id === chemicalId && app.status === 'approved')
    .filter((app) => {
      if (year === null) return true;
      if (app.export_date) {
        return new Date(app.export_date).getFullYear() === year;
      }
      const d = getTccCertificateDate(app);
      return d?.getFullYear() === year;
    })
    .reduce((sum, app) => roundQuantityMt(sum + Number(app.quantity_mt ?? 0)), 0);
}

/** Sum approved TCC tonnage consumed against a specific RC validity window. */
export function sumApprovedExportsInReachWindow(
  applications: TccExportRecord[],
  chemicalId: string,
  reachCert: Pick<ReachCertificateRecord, 'id' | 'issued_at' | 'expires_at'>,
  excludeApplicationId?: string
): number {
  return applications
    .filter((app) => app.chemical_id === chemicalId && app.status === 'approved')
    .filter((app) => !excludeApplicationId || app.id !== excludeApplicationId)
    .filter((app) => {
      if (app.reach_certificate_id) {
        return app.reach_certificate_id === reachCert.id;
      }
      if (!app.export_date) return false;
      return isDateInReachWindow(app.export_date, reachCert.issued_at, reachCert.expires_at);
    })
    .reduce((sum, app) => roundQuantityMt(sum + Number(app.quantity_mt ?? 0)), 0);
}

export function getReachCertAllocatedQuota(
  cert: { allocated_quantity?: number | null; tonnage_band?: string | null },
  tonnageBand?: string | null
): number {
  const explicit = cert.allocated_quantity;
  if (explicit != null && Number(explicit) > 0) {
    return Number(explicit);
  }
  if (cert.tonnage_band?.trim()) {
    return getTonnageBandMaxQuota(cert.tonnage_band) ?? 0;
  }
  return getTonnageBandMaxQuota(tonnageBand) ?? 0;
}

export function getRemainingQuotaForReachPeriod(
  exportedMt: number,
  tonnageBand: string | null | undefined,
  allocatedQuantity?: number | null
): number {
  const max =
    allocatedQuantity != null && Number(allocatedQuantity) > 0
      ? Number(allocatedQuantity)
      : getTonnageBandMaxQuota(tonnageBand);
  if (max == null) return 0;
  return Math.max(0, roundQuantityMt(max - Number(exportedMt || 0)));
}

export function computeTccQuotaForExportDate(params: {
  reachCertificates: ReachCertificateRecord[];
  approvedApplications: TccExportRecord[];
  chemicalId: string;
  exportDate: string;
  tonnageBand: string | null | undefined;
  excludeApplicationId?: string;
}): {
  reachCert: ReachCertificateRecord | null;
  remainingQuota: number;
  exportedMt: number;
  bandMax: number | null;
  error?: string;
} {
  const reachCert = findReachCertificateForExportDate(
    params.reachCertificates,
    params.chemicalId,
    params.exportDate
  );

  if (!reachCert) {
    return {
      reachCert: null,
      remainingQuota: 0,
      exportedMt: 0,
      bandMax: getTonnageBandMaxQuota(params.tonnageBand),
      error:
        'No Active CT Certificate Available.',
    };
  }

  const exportedMt = sumApprovedExportsInReachWindow(
    params.approvedApplications,
    params.chemicalId,
    reachCert,
    params.excludeApplicationId
  );

  const resolvedTonnageBand = reachCert.tonnage_band || params.tonnageBand;
  const bandMax = getReachCertAllocatedQuota(reachCert, resolvedTonnageBand);
  const remainingQuota = getRemainingQuotaForReachPeriod(
    exportedMt,
    resolvedTonnageBand,
    reachCert.allocated_quantity
  );

  return { reachCert, remainingQuota, exportedMt, bandMax };
}

export function resolveQuotaConsumption(
  exportedMt: number,
  tonnageBand: string | null | undefined,
  availableQuantity = 0,
  allocatedQuantity?: number | null
) {
  const explicitMax =
    allocatedQuantity != null && Number(allocatedQuantity) > 0
      ? Number(allocatedQuantity)
      : null;
  const bandMax = explicitMax ?? getTonnageBandMaxQuota(tonnageBand);
  const exported = Number(exportedMt || 0);
  const calculatedTotal = Number(availableQuantity || 0) + exported;
  const totalQuota = bandMax != null ? bandMax : calculatedTotal;
  const isExceeded = totalQuota > 0 && exported > totalQuota;
  const percentUsed = totalQuota > 0 ? (exported / totalQuota) * 100 : 0;
  const remaining = Math.max(0, roundQuantityMt(totalQuota - exported));

  return { exported, totalQuota, percentUsed, isExceeded, remaining };
}

export function getRemainingQuota(
  availableQuantity: number,
  exportedMt: number,
  tonnageBand: string | null | undefined
): number {
  const bandMax = getTonnageBandMaxQuota(tonnageBand);
  if (bandMax != null) {
    return Math.max(0, roundQuantityMt(bandMax - Number(exportedMt || 0)));
  }
  return Math.max(0, Number(availableQuantity || 0));
}

export function computeAssignableQuota(
  bandMax: number | null | undefined,
  exportedMt: number
): { assignable: number; error?: string } {
  if (bandMax == null) {
    return { assignable: 0 };
  }

  const remaining = roundQuantityMt(bandMax - Number(exportedMt || 0));
  if (remaining <= 0) {
    return {
      assignable: 0,
      error: `${exportedMt} MT already issued this year. Tonnage band limit is ${bandMax} MT — no quota left to assign.`,
    };
  }
  return { assignable: remaining };
}
