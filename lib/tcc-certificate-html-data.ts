import { getTccTemplatePreviewSample } from '@/lib/certificate-template-preview-data';
import {
  buildReachAddressLines,
  formatEuReachManufacturerAddressDisplay,
  formatReachCertDate,
  normalizeCertDateIso,
} from '@/lib/reach-certificate-data';
import { resolveTccCertificateDateOfIssue } from '@/lib/tcc-certificate-dates';
import { buildEuImporterFullAddress, splitEuImporterAddress } from '@/lib/tcc-eu-importer';

export type TccPdfClient = {
  company_name: string;
  uuid_number?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
};

export type TccPdfChemical = {
  chemical_name: string;
  cas_number: string;
  ec_number?: string | null;
  tonnage_band?: string | null;
};

export type TccPdfApplication = {
  quantity_mt: number;
  export_date?: string | null;
  tracking_id?: string | null;
  registration_number?: string | null;
  remarks?: string | null;
  eu_importer_company_name?: string | null;
  eu_importer_address?: string | null;
  purchase_order_number?: string | null;
  invoice_number?: string | null;
};

export type TccCertificateDocxData = {
  companyName: string;
  addressLine1: string;
  addressLine2: string;
  addressLine3: string;
  exporterFullAddress: string;
  chemicalName: string;
  ecNumber: string;
  casNumber: string;
  registrationNumber: string;
  tonnageBand: string;
  uuidNumber: string;
  euImporterName: string;
  euImporterAddr1: string;
  euImporterAddr2: string;
  euImporterAddr3: string;
  euImporterFullAddress: string;
  volumeMt: string;
  deliveryChallanNo: string;
  exportDate: string;
  validUntilDate: string;
};

export type TccCertificateHtmlData = TccCertificateDocxData & {
  certificateNumber: string;
  manufacturerAddress: string;
  exportDateDisplay: string;
  validUntilDateDisplay: string;
  invoiceNo: string;
  poNo: string;
  accentColor: string;
  logoUrl: string | null;
  signatureUrl: string | null;
  footerLines: string[];
};

export const TCC_CERTIFICATE_FOOTER_LINES = [
  'Pharmegic Healthcare Limited',
  '6th, Floor, Konstitucijos av. 21A, 08130 Vilnius, Lithuania | VAT: LT100012557418',
  'js@pharmegichealthcarelimited.com | : +37 05 2074005 | www.pharmegichealthcare.com',
] as const;

export const TCC_LEGAL_PARAGRAPH_1 =
  'According to “Guidance on REACH Registration (Version 3.0)” published by ECHA, it is necessary that the “non-Community manufacturer” provides his Only Representative with up-to-date information on the list of EU importers which should be covered by the registration of the Only Representative and the quantities imported into the EU.';

export const TCC_LEGAL_PARAGRAPH_2 =
  'We hereby issue this volume tracking and tonnage coverage certificate to show the enforcement authorities of member states that the imported product delivered to the EU entity below is covered by the registration of Pharmegic Healthcare and is thus REACH compliant. The EU importer below will be regarded as downstream users and thus be exempt from REACH registration. However, the EU importer remains responsible for his import from other non-EU suppliers.';

/** @deprecated Use TCC_LEGAL_PARAGRAPH_1 and TCC_LEGAL_PARAGRAPH_2 */
export const TCC_LEGAL_PARAGRAPH = `${TCC_LEGAL_PARAGRAPH_1} ${TCC_LEGAL_PARAGRAPH_2}`;

const DEFAULT_ACCENT = '#145E40';
const DEFAULT_LOGO = '/pharmegic-logo.png';
const DEFAULT_SEAL = '/certificate-assets/rc-seal.png';

function buildExporterFullAddress(client: TccPdfClient): string {
  return formatEuReachManufacturerAddressDisplay(client);
}

function parseEuImporterFields(remarks?: string | null, registrationNumber?: string | null): {
  name: string;
  addr1: string;
  addr2: string;
  addr3: string;
} {
  const lines = (remarks || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length >= 2) {
    return {
      name: lines[0],
      addr1: lines[1] || '—',
      addr2: lines[2] || '—',
      addr3: lines.slice(3).join(', ') || '—',
    };
  }

  if (registrationNumber?.trim()) {
    return {
      name: registrationNumber.trim(),
      addr1: '—',
      addr2: '—',
      addr3: '—',
    };
  }

  return {
    name: '—',
    addr1: '—',
    addr2: '—',
    addr3: '—',
  };
}

function buildTccDocxFields(input: {
  client: TccPdfClient;
  chemical: TccPdfChemical;
  application: TccPdfApplication;
  registrationNumber?: string | null;
  validUntilDate: string;
  deliveryChallanNo?: string | null;
}): TccCertificateDocxData {
  const address = buildReachAddressLines(input.client);
  const exportDateRaw = input.application.export_date || new Date().toISOString().split('T')[0];

  const euCompanyName = input.application.eu_importer_company_name?.trim();
  const euAddress = input.application.eu_importer_address?.trim();
  let euImporterName: string;
  let euImporterAddr1: string;
  let euImporterAddr2: string;
  let euImporterAddr3: string;

  if (euCompanyName) {
    euImporterName = euCompanyName;
    const split = splitEuImporterAddress(euAddress || '');
    euImporterAddr1 = split.addr1;
    euImporterAddr2 = split.addr2;
    euImporterAddr3 = split.addr3;
  } else {
    const legacy = parseEuImporterFields(
      input.application.remarks,
      input.application.registration_number
    );
    euImporterName = legacy.name;
    euImporterAddr1 = legacy.addr1;
    euImporterAddr2 = legacy.addr2;
    euImporterAddr3 = legacy.addr3;
  }

  return {
    companyName: input.client.company_name,
    addressLine1: address.line1,
    addressLine2: address.line2,
    addressLine3: address.line3,
    exporterFullAddress: buildExporterFullAddress(input.client),
    chemicalName: input.chemical.chemical_name,
    ecNumber: input.chemical.ec_number || '—',
    casNumber: input.chemical.cas_number,
    registrationNumber: input.registrationNumber?.trim() || '—',
    tonnageBand: input.chemical.tonnage_band || '—',
    uuidNumber: input.client.uuid_number || '—',
    euImporterName,
    euImporterAddr1,
    euImporterAddr2,
    euImporterAddr3,
    euImporterFullAddress: buildEuImporterFullAddress(
      euImporterAddr1,
      euImporterAddr2,
      euImporterAddr3
    ),
    volumeMt: `${Number(input.application.quantity_mt)} MT`,
    deliveryChallanNo:
      input.deliveryChallanNo?.trim() ||
      input.application.purchase_order_number?.trim() ||
      input.application.tracking_id?.trim() ||
      '—',
    exportDate: formatReachCertDate(exportDateRaw),
    validUntilDate: formatReachCertDate(input.validUntilDate),
  };
}

export function parseTccFooterLines(footerText?: string | null): string[] {
  if (footerText?.includes('\n')) {
    const lines = footerText.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length > 0) {
      while (lines.length < 3) lines.push('');
      return lines.slice(0, 3);
    }
  }
  return [...TCC_CERTIFICATE_FOOTER_LINES];
}

export type BuildTccHtmlDataInput = {
  certificateNumber: string;
  client: TccPdfClient;
  chemical: TccPdfChemical;
  application: TccPdfApplication;
  registrationNumber?: string | null;
  validUntilDate: string;
  deliveryChallanNo?: string | null;
  issuedDate?: string | null;
};

export type BuildTccHtmlDataOptions = {
  accentColor?: string | null;
  logoUrl?: string | null;
  signatureUrl?: string | null;
  footerText?: string | null;
};

export function buildTccHtmlData(
  input: BuildTccHtmlDataInput,
  options?: BuildTccHtmlDataOptions
): TccCertificateHtmlData {
  const docx = buildTccDocxFields({
    client: input.client,
    chemical: input.chemical,
    application: input.application,
    registrationNumber: input.registrationNumber,
    validUntilDate: input.validUntilDate,
    deliveryChallanNo: input.deliveryChallanNo,
  });

  const issueDateRaw = resolveTccCertificateDateOfIssue({
    poDate: input.application.export_date,
    issuedDate: input.issuedDate,
  });
  const validUntilRaw = normalizeCertDateIso(input.validUntilDate) ?? input.validUntilDate;
  const issueDateDisplay = formatReachCertDate(issueDateRaw);

  return {
    ...docx,
    certificateNumber: input.certificateNumber,
    manufacturerAddress: formatEuReachManufacturerAddressDisplay(input.client),
    exportDateDisplay: issueDateDisplay,
    validUntilDateDisplay: formatReachCertDate(validUntilRaw),
    invoiceNo:
      input.application.invoice_number?.trim() ||
      input.application.tracking_id?.trim() ||
      '—',
    poNo:
      input.application.purchase_order_number?.trim() ||
      input.deliveryChallanNo?.trim() ||
      '—',
    accentColor: options?.accentColor?.trim() || DEFAULT_ACCENT,
    logoUrl: options?.logoUrl?.trim() || DEFAULT_LOGO,
    signatureUrl: options?.signatureUrl?.trim() || DEFAULT_SEAL,
    footerLines: parseTccFooterLines(options?.footerText),
  };
}

export function buildTccTemplatePreviewHtmlData(
  options?: BuildTccHtmlDataOptions
): TccCertificateHtmlData {
  const sample = getTccTemplatePreviewSample();

  return {
    ...sample,
    certificateNumber: 'TCC-2026-PREVIEW',
    manufacturerAddress: formatEuReachManufacturerAddressDisplay({
      address: 'C-1/394, Phase II, G.I.D.C. Estate, Vatva',
      city: 'Ahmedabad',
      state: 'Gujarat',
      postal_code: '382445',
      country: 'India',
    }),
    exportDateDisplay: sample.exportDate,
    validUntilDateDisplay: sample.validUntilDate,
    invoiceNo: 'PHCL',
    poNo: sample.deliveryChallanNo,
    accentColor: options?.accentColor?.trim() || DEFAULT_ACCENT,
    logoUrl: options?.logoUrl?.trim() || DEFAULT_LOGO,
    signatureUrl: options?.signatureUrl?.trim() || DEFAULT_SEAL,
    footerLines: parseTccFooterLines(options?.footerText),
  };
}
