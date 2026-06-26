import { normalizeReachDisplayValue, resolveReachTonnageBand } from '@/lib/reach-certificate-fields';

export type ReachCertificateDocxData = {
  companyName: string;
  addressLine1: string;
  addressLine2: string;
  addressLine3: string;
  chemicalName: string;
  ecNumber: string;
  casNumber: string;
  registrationNumber: string;
  tonnageBand: string;
  uuidNumber: string;
  issuedDate: string;
  validatedDate: string;
};

export type ReachPdfSource = {
  company_name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  uuid_number?: string | null;
};

export type ReachPdfChemical = {
  chemical_name: string;
  cas_number: string;
  ec_number?: string | null;
  tonnage_band?: string | null;
};

export function escapeReachXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Normalize DB / form values to YYYY-MM-DD for certificate formatting. */
export function normalizeCertDateIso(
  value: string | Date | null | undefined
): string | null {
  if (value == null || value === '') return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().split('T')[0];
  }

  const trimmed = String(value).trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.split('T')[0];
  }

  const dotted = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dotted) {
    return `${dotted[3]}-${dotted[2]}-${dotted[1]}`;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return null;
}

/** Format as DD.MM.YYYY (used by TCC certificates). */
export function formatReachCertDate(dateStr: string | Date | null | undefined): string {
  const iso = normalizeCertDateIso(dateStr);
  if (!iso) return typeof dateStr === 'string' ? dateStr : '—';
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  return `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
}

/** Format as "1 January 2026" for EU REACH certificate. */
export function formatReachCertDateLong(dateStr: string): string {
  const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
  if (!year || !month || !day) return dateStr;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function isReachMissingField(value?: string | null): boolean {
  const trimmed = value?.trim() ?? '';
  return !trimmed || trimmed === '—';
}

/** EU REACH: "Street, City - Postal," on one line; country on the next. */
export function buildEuReachAddressLine1(client: {
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
}): string {
  const street = client.address?.trim();
  const city = client.city?.trim();
  const postal = client.postal_code?.trim();

  const parts: string[] = [];
  if (street && !isReachMissingField(street)) parts.push(street);

  if (city && postal) {
    parts.push(`${city} - ${postal}`);
  } else if (city && !isReachMissingField(city)) {
    parts.push(city);
  } else if (postal && !isReachMissingField(postal)) {
    parts.push(postal);
  }

  if (parts.length === 0) return '—';
  return `${parts.join(', ')},`;
}

/** Manufacturer card: "Street, City - Postal, State, Country" on one line (docx uses line1 + line3). */
export function formatEuReachManufacturerAddress(client: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
}): { line1: string; line3: string } {
  const street = client.address?.trim();
  const city = client.city?.trim();
  const postal = client.postal_code?.trim();
  const state = client.state?.trim();
  const country = client.country?.trim();

  const locality: string[] = [];
  if (street && !isReachMissingField(street)) locality.push(street);

  if (city && postal) {
    locality.push(`${city} - ${postal}`);
  } else if (city && !isReachMissingField(city)) {
    locality.push(city);
  } else if (postal && !isReachMissingField(postal)) {
    locality.push(postal);
  }

  if (state && !isReachMissingField(state)) locality.push(state);

  if (locality.length === 0) {
    return {
      line1: country && !isReachMissingField(country) ? country : '—',
      line3: '',
    };
  }

  return {
    line1: `${locality.join(', ')},`,
    line3: country && !isReachMissingField(country) ? country : '',
  };
}

/** Single-line manufacturer address for HTML preview and display. */
export function formatEuReachManufacturerAddressDisplay(client: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
}): string {
  const { line1, line3 } = formatEuReachManufacturerAddress(client);
  return [line1, line3].filter(Boolean).join(' ');
}

export function buildReachAddressLines(client: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
}): { line1: string; line2: string; line3: string } {
  const cityState = [client.city, client.state].filter(Boolean).join(', ');
  const cityPostal =
    client.city && client.postal_code
      ? `${client.city} – ${client.postal_code}`
      : [client.city, client.postal_code].filter(Boolean).join(' – ');
  const line3 = [cityPostal, client.country].filter(Boolean).join(', ');

  return {
    line1: client.address?.trim() || '—',
    line2: cityState || '—',
    line3: line3 || '—',
  };
}

export function buildReachDocxData(
  client: ReachPdfSource,
  chemical: ReachPdfChemical,
  options: {
    registrationNumber: string;
    issuedDate: string;
    validatedDate: string;
    tonnageBand?: string | null;
  }
): ReachCertificateDocxData {
  const address = buildReachAddressLines(client);
  const manufacturerAddress = formatEuReachManufacturerAddress(client);
  const issuedIso = options.issuedDate.split('T')[0];
  const validatedIso = options.validatedDate.split('T')[0];
  const tonnage = resolveReachTonnageBand(options.tonnageBand, chemical.tonnage_band);
  return {
    companyName: normalizeReachDisplayValue(client.company_name),
    addressLine1: manufacturerAddress.line1,
    addressLine2: normalizeReachDisplayValue(address.line2),
    addressLine3: manufacturerAddress.line3,
    chemicalName: normalizeReachDisplayValue(chemical.chemical_name),
    ecNumber: normalizeReachDisplayValue(chemical.ec_number),
    casNumber: normalizeReachDisplayValue(chemical.cas_number),
    registrationNumber: normalizeReachDisplayValue(options.registrationNumber),
    tonnageBand: normalizeReachDisplayValue(tonnage),
    uuidNumber: normalizeReachDisplayValue(client.uuid_number),
    issuedDate: issuedIso,
    validatedDate: validatedIso,
  };
}
