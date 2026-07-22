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
  isIntermediateSubstance: boolean;
};

/** Shown beside the "Registered Substance Details" heading when a substance is flagged as an intermediate. */
export const INTERMEDIATE_SUBSTANCE_NOTE = 'This substance is registered as Intermediate.';

const REACH_CERTIFICATE_FOOTER_LINES = [
  'Pharmegic Healthcare Limited',
  '6th, Floor, Konstitucijos av. 21A, 08130 Vilnius, Lithuania | VAT: LT100012557418',
  'js@pharmegichealthcarelimited.com | : +37 05 2074005 | www.pharmegichealthcare.com',
] as const;

function parseReachFooterLines(footerText?: string | null): string[] {
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

/**
 * Resolves a certificate branding image:
 * - `null` / `undefined` (never configured) → the built-in default image
 * - empty string (explicitly removed by an admin) → no image (`null`)
 * - otherwise → the configured image URL / data URI
 */
export function resolveBrandingAsset(
  value: string | null | undefined,
  fallback: string
): string | null {
  if (value == null) return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

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
    logoUrl: resolveBrandingAsset(options.logoUrl, DEFAULT_LOGO),
    signatureUrl: resolveBrandingAsset(options.signatureUrl, DEFAULT_SEAL),
    footerLines: parseReachFooterLines(options.footerText),
    isIntermediateSubstance: Boolean(chemical.is_intermediate_substance),
  };
}
