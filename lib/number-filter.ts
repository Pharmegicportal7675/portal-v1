/** True if numeric value falls within inclusive [min, max] filter strings */
export function matchesNumberRange(
  value: number | string | null | undefined,
  min: string,
  max: string
): boolean {
  if (!min.trim() && !max.trim()) return true;

  const n = Number(value);
  if (!Number.isFinite(n)) return false;

  if (min.trim()) {
    const minN = Number(min);
    if (Number.isFinite(minN) && n < minN) return false;
  }

  if (max.trim()) {
    const maxN = Number(max);
    if (Number.isFinite(maxN) && n > maxN) return false;
  }

  return true;
}
