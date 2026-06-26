export const REGULATORY_REGISTRATIONS = {
  EU_REACH: 'eu_reach',
  UK_REACH: 'uk_reach',
  TURKEY_KKDIK: 'turkey_kkdik',
} as const;

export type RegulatoryRegistration =
  (typeof REGULATORY_REGISTRATIONS)[keyof typeof REGULATORY_REGISTRATIONS];

export const REGULATORY_REGISTRATION_OPTIONS: {
  value: RegulatoryRegistration;
  label: string;
  shortLabel: string;
}[] = [
  { value: REGULATORY_REGISTRATIONS.EU_REACH, label: 'EU REACH', shortLabel: 'EU REACH' },
  { value: REGULATORY_REGISTRATIONS.UK_REACH, label: 'UK REACH', shortLabel: 'UK REACH' },
  {
    value: REGULATORY_REGISTRATIONS.TURKEY_KKDIK,
    label: 'TURKEY REACH (KKDIK)',
    shortLabel: 'Turkey REACH (KKDIK)',
  },
];

export function normalizeRegulatoryRegistrations(
  value: unknown
): RegulatoryRegistration[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(REGULATORY_REGISTRATION_OPTIONS.map((option) => option.value));
  return value.filter(
    (item): item is RegulatoryRegistration =>
      typeof item === 'string' && allowed.has(item as RegulatoryRegistration)
  );
}

export function getRegulatoryRegistrationLabel(value?: string | null): string {
  const match = REGULATORY_REGISTRATION_OPTIONS.find((option) => option.value === value);
  return match?.label ?? value ?? '—';
}

export function isEuReachFramework(value?: string | null): boolean {
  return !value || value === REGULATORY_REGISTRATIONS.EU_REACH;
}

export function isNotificationOnlyFramework(value?: string | null): boolean {
  return (
    value === REGULATORY_REGISTRATIONS.UK_REACH ||
    value === REGULATORY_REGISTRATIONS.TURKEY_KKDIK
  );
}

export function clientHasRegulatoryRegistration(
  registrations: string[] | null | undefined,
  framework: RegulatoryRegistration
): boolean {
  return normalizeRegulatoryRegistrations(registrations).includes(framework);
}

export function clientHasEuReachRegistration(
  registrations: string[] | null | undefined
): boolean {
  return clientHasRegulatoryRegistration(registrations, REGULATORY_REGISTRATIONS.EU_REACH);
}

export const EU_REACH_CERTIFICATE_REQUIRED_MESSAGE =
  'EU REACH must be enabled on this client profile to issue EU REACH (CT) or TCC certificates.';
