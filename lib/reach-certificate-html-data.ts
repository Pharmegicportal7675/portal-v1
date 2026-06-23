import {
  buildReachDocxData,
  formatEuReachManufacturerAddressDisplay,
  formatReachCertDateLong,
  type ReachCertificateDocxData,
  type ReachPdfChemical,
  type ReachPdfSource,
} from '@/lib/reach-certificate-data';

export type ReachCertificateHtmlData = ReachCertificateDocxData & {
  manufacturerAddress: string;
  issuedDateDisplay: string;
  validatedDateDisplay: string;
  accentColor: string;
  logoUrl: string | null;
  signatureUrl: string | null;
  footerLines: string[];
};

export const REACH_CERTIFICATE_FOOTER_LINES = [
  'Pharmegic Healthcare Limited',
  '6th, Floor, Konstitucijos av. 21A, 08130 Vilnius, Lithuania | VAT: LT100012557418',
  'js@pharmegichealthcarelimited.com | : +37 05 2074005 | www.pharmegichealthcare.com',
] as const;

export function parseReachFooterLines(footerText?: string | null): string[] {
  if (footerText?.includes('\n')) {
    const lines = footerText.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length > 0) {
      while (lines.length < 3) lines.push('');
      return lines.slice(0, 3);
    }
  }

  return [...REACH_CERTIFICATE_FOOTER_LINES];
}

const DEFAULT_ACCENT = '#145E40';
const DEFAULT_LOGO = '/pharmegic-logo.png';
const DEFAULT_SEAL = '/certificate-assets/rc-seal.png';

export type BuildReachHtmlDataOptions = {
  registrationNumber: string;
  issuedDate: string;
  validatedDate: string;
  tonnageBand?: string | null;
  accentColor?: string | null;
  logoUrl?: string | null;
  signatureUrl?: string | null;
  footerText?: string | null;
};

export function buildReachHtmlData(
  client: ReachPdfSource,
  chemical: ReachPdfChemical,
  options: BuildReachHtmlDataOptions
): ReachCertificateHtmlData {
  const docx = buildReachDocxData(client, chemical, options);

  return {
    ...docx,
    manufacturerAddress: formatEuReachManufacturerAddressDisplay(client),
    issuedDateDisplay: formatReachCertDateLong(docx.issuedDate),
    validatedDateDisplay: formatReachCertDateLong(docx.validatedDate),
    accentColor: options.accentColor?.trim() || DEFAULT_ACCENT,
    logoUrl: options.logoUrl?.trim() || DEFAULT_LOGO,
    signatureUrl: options.signatureUrl?.trim() || DEFAULT_SEAL,
    footerLines: parseReachFooterLines(options.footerText),
  };
}
