/** Blank / missing RC certificate field values show as em dash in the Word template. */
export function normalizeReachDisplayValue(value?: string | null): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed || trimmed.toLowerCase() === 'none') return '—';
  return trimmed;
}

export function resolveReachTonnageBand(
  override: string | null | undefined,
  chemicalBand?: string | null
): string | null {
  if (override !== undefined && override !== null) {
    return override.trim() || null;
  }
  const fromChemical = chemicalBand?.trim();
  return fromChemical || null;
}
