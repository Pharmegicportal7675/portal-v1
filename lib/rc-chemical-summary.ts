import {
  canRenewReachForChemical,
  getReachCertificateStatus,
  getReachCertificateYear,
  getReachCertsForClientChemical,
  isActiveReachCertificate,
  type ReachCertificateRecord,
} from '@/lib/reach-certificate';
import {
  getReachCertAllocatedQuota,
  getTonnageBandMaxQuota,
  resolveDisplayedTonnageBand,
  sumApprovedExportsInReachWindow,
  type TccExportRecord,
} from '@/lib/quota';

export type ClientChemLike = {
  chemical_id: string;
  chemicals?: {
    chemical_name?: string | null;
    cas_number?: string | null;
    ec_number?: string | null;
    tonnage_band?: string | null;
  } | null;
  registration_number?: string | null;
  certificate_number?: string | null;
  validity_date?: string | null;
  available_quantity?: number | null;
};

export type RcChemicalSummaryRow = {
  clientChem: ClientChemLike;
  chemicalId: string;
  chemicalName: string;
  casNumber: string;
  ecNumber: string;
  tonnageBand: string;
  certs: ReachCertificateRecord[];
  activeCert: ReachCertificateRecord | null;
  latestCert: ReachCertificateRecord | null;
  years: number[];
  currentQuantity: number;
  usedQuantity: number;
  remainingQuantity: number;
  status: 'active' | 'expired' | 'pending';
  canRenew: boolean;
};

export function buildRcChemicalSummaries(
  clientChemicals: ClientChemLike[],
  certificates: ReachCertificateRecord[],
  tccHistory: TccExportRecord[]
): RcChemicalSummaryRow[] {
  const rows = clientChemicals.map((cc) => {
    const certs = getReachCertsForClientChemical(
      certificates,
      cc.chemical_id,
      cc.chemicals?.cas_number,
      cc.registration_number,
      cc.certificate_number,
      cc.chemicals?.chemical_name
    );
    const activeCert = certs.find((cert) => isActiveReachCertificate(cert)) ?? null;
    const latestCert = certs[0] ?? null;
    const displayCert = activeCert ?? latestCert;
    const tonnageBand = resolveDisplayedTonnageBand(
      displayCert?.tonnage_band ?? latestCert?.tonnage_band,
      cc.chemicals?.tonnage_band,
      ''
    );
    const years = [
      ...new Set(
        certs
          .map((cert) => getReachCertificateYear(cert.issued_at))
          .filter((year): year is number => year != null)
      ),
    ].sort((a, b) => b - a);

    const currentQuantity = displayCert
      ? getReachCertAllocatedQuota(displayCert, tonnageBand)
      : getTonnageBandMaxQuota(tonnageBand) ?? 0;

    const usedQuantity =
      displayCert
        ? sumApprovedExportsInReachWindow(tccHistory, cc.chemical_id, displayCert)
        : 0;

    const remainingQuantity = Math.max(0, currentQuantity - usedQuantity);

    let status: RcChemicalSummaryRow['status'] = 'pending';
    if (certs.length > 0) {
      status = activeCert ? 'active' : 'expired';
    }

    const canRenew =
      certs.length > 0 &&
      canRenewReachForChemical(certs, cc.validity_date) &&
      latestCert != null &&
      getReachCertificateStatus(latestCert) !== 'revoked';

    return {
      clientChem: cc,
      chemicalId: cc.chemical_id,
      chemicalName: cc.chemicals?.chemical_name?.trim() || 'Unknown',
      casNumber: cc.chemicals?.cas_number?.trim() || 'N/A',
      ecNumber: cc.chemicals?.ec_number?.trim() || 'N/A',
      tonnageBand,
      certs,
      activeCert,
      latestCert,
      years,
      currentQuantity,
      usedQuantity,
      remainingQuantity,
      status,
      canRenew,
    };
  });

  rows.sort((a, b) => a.chemicalName.localeCompare(b.chemicalName));
  return rows;
}

export function buildRcHistoryRows(
  summary: RcChemicalSummaryRow,
  tccHistory: TccExportRecord[]
) {
  return summary.certs.map((cert) => {
    const year = getReachCertificateYear(cert.issued_at);
    const allocated = getReachCertAllocatedQuota(cert, cert.tonnage_band || summary.tonnageBand);
    const used = sumApprovedExportsInReachWindow(tccHistory, summary.chemicalId, cert);
    const balance = Math.max(0, allocated - used);
    const certStatus = getReachCertificateStatus(cert);
    return {
      cert,
      year,
      allocated,
      used,
      balance,
      status: certStatus === 'valid' ? 'Active' : certStatus === 'expired' ? 'Expired' : cert.status,
    };
  });
}
