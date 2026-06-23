/** Parse YYYY-MM-DD (or ISO datetime) to local midnight date */
export function parseFilterDate(value: string): Date | null {
  if (!value.trim()) return null;
  const datePart = value.trim().split('T')[0];
  const d = new Date(`${datePart}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** True if dateStr falls within inclusive [from, to] filter strings (YYYY-MM-DD) */
export function matchesDateRange(
  dateStr: string | null | undefined,
  from: string,
  to: string
): boolean {
  if (!from.trim() && !to.trim()) return true;
  if (!dateStr) return false;

  const d = parseFilterDate(dateStr);
  if (!d) return false;

  const fromD = parseFilterDate(from);
  const toD = parseFilterDate(to);

  if (fromD && d < fromD) return false;
  if (toD && d > toD) return false;
  return true;
}

export function formatDisplayDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return '—';
  }
}

/** Stable en-GB datetime for SSR + client (avoids hydration mismatch). */
export function formatDisplayDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    });
  } catch {
    return '—';
  }
}
