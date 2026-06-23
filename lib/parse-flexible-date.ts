import * as XLSX from 'xlsx';

function isValidDateParts(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(year, month - 1, day);
  return (
    probe.getFullYear() === year && probe.getMonth() === month - 1 && probe.getDate() === day
  );
}

export function toIsoDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function fromValidParts(year: number, month: number, day: number): string | null {
  if (!isValidDateParts(year, month, day)) return null;
  return toIsoDateString(year, month, day);
}

function parseExcelSerial(serial: number): string | null {
  if (!Number.isFinite(serial) || serial <= 0) return null;
  try {
    const parsed = XLSX.SSF.parse_date_code(serial);
    if (!parsed) return null;
    return fromValidParts(parsed.y, parsed.m, parsed.d);
  } catch {
    return null;
  }
}

function resolveDayMonthYear(a: number, b: number, year: number): string | null {
  if (a > 12 && b <= 12) {
    return fromValidParts(year, b, a);
  }
  if (b > 12 && a <= 12) {
    return fromValidParts(year, a, b);
  }
  if (a <= 12 && b <= 12) {
    const ddMm = fromValidParts(year, b, a);
    if (ddMm) return ddMm;
    return fromValidParts(year, a, b);
  }
  return null;
}

function parseSeparatedDate(raw: string): string | null {
  const match = raw.match(/^(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})$/);
  if (!match) return null;

  const partA = Number(match[1]);
  const partB = Number(match[2]);
  let partC = Number(match[3]);

  if (match[3].length === 2) {
    partC = 2000 + partC;
  }

  if (match[1].length === 4) {
    const direct = fromValidParts(partA, partB, partC);
    if (direct) return direct;
    if (partB > 12 && partC <= 12) {
      return fromValidParts(partA, partC, partB);
    }
    return null;
  }

  if (match[3].length === 4 || match[3].length === 2) {
    return resolveDayMonthYear(partA, partB, partC);
  }

  return null;
}

function parseIsoLike(raw: string): string | null {
  const match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const direct = fromValidParts(year, month, day);
  if (direct) return direct;

  if (month > 12 && day <= 12) {
    return fromValidParts(year, day, month);
  }

  return null;
}

/**
 * Accepts common spreadsheet / form date formats and returns YYYY-MM-DD for Postgres.
 * Prefers DD-MM-YYYY when day/month are ambiguous.
 */
export function parseFlexibleDateToIso(value: unknown): string | null {
  if (value == null) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return fromValidParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return parseExcelSerial(value);
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const iso = parseIsoLike(raw);
  if (iso) return iso;

  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    const fromSerial = parseExcelSerial(serial);
    if (fromSerial) return fromSerial;
  }

  const separated = parseSeparatedDate(raw);
  if (separated) return separated;

  const parsed = new Date(raw.includes('T') ? raw : `${raw}T12:00:00`);
  if (!Number.isNaN(parsed.getTime())) {
    return fromValidParts(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
  }

  return null;
}

export function normalizeDateInput(
  value: unknown,
  fieldLabel = 'Date'
): { ok: true; iso: string } | { ok: false; error: string } {
  const iso = parseFlexibleDateToIso(value);
  if (!iso) {
    const shown = value == null || String(value).trim() === '' ? '(empty)' : String(value).trim();
    return {
      ok: false,
      error: `${fieldLabel} is invalid (${shown}). Use DD-MM-YYYY, DD/MM/YYYY, or YYYY-MM-DD.`,
    };
  }
  return { ok: true, iso };
}

export function normalizeOptionalDateInput(
  value: unknown,
  fieldLabel = 'Date'
): { ok: true; iso: string | null } | { ok: false; error: string } {
  if (value == null || String(value).trim() === '') {
    return { ok: true, iso: null };
  }
  const result = normalizeDateInput(value, fieldLabel);
  if (!result.ok) return result;
  return { ok: true, iso: result.iso };
}
