import { computeTccQuotaForExportDate, type TccExportRecord } from '@/lib/quota';
import { isReachCertificateType, type ReachCertificateRecord } from '@/lib/reach-certificate';

export type TccApplicationQuotaInput = {
  id: string;
  client_id?: string;
  chemical_id?: string;
  export_date: string | null;
  status: string;
  chemicals?:
    | { tonnage_band?: string | null }
    | { tonnage_band?: string | null }[]
    | null;
  rc_remaining_quota?: number | null;
  rc_period_certificate?: string | null;
  rc_tonnage_band?: string | null;
  rc_registration_number?: string | null;
  rc_certificate_year?: number | null;
};

function resolveTonnageBand(
  chemicals: TccApplicationQuotaInput['chemicals']
): string | null {
  if (!chemicals) return null;
  const row = Array.isArray(chemicals) ? chemicals[0] : chemicals;
  return row?.tonnage_band ?? null;
}

export function computeTccApplicationRcQuota(
  app: TccApplicationQuotaInput,
  reachCertificates: ReachCertificateRecord[],
  approvedApplications: TccExportRecord[]
) {
  if (!app.export_date || !app.chemical_id) {
    return { remainingQuota: 0, reachCert: null as ReachCertificateRecord | null };
  }

  const chemicalReachCerts = reachCertificates.filter(
    (cert) =>
      cert.chemical_id === app.chemical_id &&
      isReachCertificateType(cert) &&
      cert.status !== 'revoked'
  );

  return computeTccQuotaForExportDate({
    reachCertificates: chemicalReachCerts,
    approvedApplications,
    chemicalId: app.chemical_id,
    exportDate: app.export_date,
    tonnageBand: resolveTonnageBand(app.chemicals),
    excludeApplicationId: app.status === 'approved' ? undefined : app.id,
  });
}

export function getTccApplicationAvailableQuota(
  app: TccApplicationQuotaInput,
  reachCertificates?: ReachCertificateRecord[],
  approvedApplications?: TccExportRecord[]
): number {
  if (app.rc_remaining_quota != null && !Number.isNaN(app.rc_remaining_quota)) {
    return app.rc_remaining_quota;
  }
  if (!reachCertificates || !approvedApplications) return 0;
  return computeTccApplicationRcQuota(app, reachCertificates, approvedApplications).remainingQuota;
}

/** RC-period tonnage band from the matched certificate; falls back to chemical registry band. */
export function resolveTccApplicationTonnageBand(app: TccApplicationQuotaInput): string | null {
  if (app.rc_tonnage_band?.trim()) return app.rc_tonnage_band.trim();
  return resolveTonnageBand(app.chemicals);
}

/** Registration number from RC cert, application, issued TCC cert, or client substance link. */
export function resolveTccApplicationRegistrationNumber(
  app: TccApplicationQuotaInput & {
    registration_number?: string | null;
    certificates?:
      | { registration_number?: string | null }
      | { registration_number?: string | null }[]
      | null;
    client_chemicals?:
      | { registration_number?: string | null }
      | { registration_number?: string | null }[]
      | null;
  }
): string | null {
  if (app.rc_registration_number?.trim()) return app.rc_registration_number.trim();
  if (app.registration_number?.trim()) return app.registration_number.trim();

  const cert = app.certificates;
  if (cert) {
    const certRow = Array.isArray(cert) ? cert[0] : cert;
    if (certRow?.registration_number?.trim()) return certRow.registration_number.trim();
  }

  const clientChem = app.client_chemicals;
  if (clientChem) {
    const linkRow = Array.isArray(clientChem) ? clientChem[0] : clientChem;
    if (linkRow?.registration_number?.trim()) return linkRow.registration_number.trim();
  }

  return null;
}

/** Calendar year of the RC certificate covering the export shipment date. */
export function resolveTccApplicationCertificateYear(
  app: TccApplicationQuotaInput
): number | null {
  if (app.rc_certificate_year != null && !Number.isNaN(app.rc_certificate_year)) {
    return app.rc_certificate_year;
  }
  return null;
}
