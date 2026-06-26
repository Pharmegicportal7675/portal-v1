import {
  ensureTccApplicationSchema,
  hasTccApplicationColumn,
} from '@/lib/tcc-application-schema';
import { normalizeCertDateIso } from '@/lib/reach-certificate-data';
import { prisma } from '@/lib/prisma';

/** Read optional valid-until date from a tcc_applications row. */
export function readTccApplicationValidUntilDate(
  app: { certificate_valid_until_date?: string | null } | Record<string, unknown>
): string | null {
  const raw =
    'certificate_valid_until_date' in app ? app.certificate_valid_until_date : undefined;
  if (raw == null || raw === '') return null;
  return normalizeCertDateIso(raw as string | Date) ?? String(raw).split('T')[0];
}

function formatValidUntilRaw(raw: Date | string | null | undefined): string | null {
  if (raw == null || raw === '') return null;
  return normalizeCertDateIso(raw);
}

/** Load Valid Upto directly from MySQL (bypasses Prisma client field list). */
export async function fetchTccApplicationValidUntilDateById(
  applicationId: string
): Promise<string | null> {
  if (!(await hasTccApplicationColumn('certificate_valid_until_date'))) return null;
  const rows = await prisma.$queryRawUnsafe<
    Array<{ certificate_valid_until_date: Date | string | null }>
  >(
    'SELECT certificate_valid_until_date FROM tcc_applications WHERE id = ? LIMIT 1',
    applicationId
  );
  return formatValidUntilRaw(rows[0]?.certificate_valid_until_date);
}

/** Persist Valid Upto directly in MySQL (bypasses Prisma client field list). */
export async function updateTccApplicationValidUntilDate(
  applicationId: string,
  validUntilIso: string | null
): Promise<void> {
  if (!(await hasTccApplicationColumn('certificate_valid_until_date'))) {
    throw new Error('certificate_valid_until_date column is not available');
  }
  await prisma.$executeRawUnsafe(
    'UPDATE tcc_applications SET certificate_valid_until_date = ? WHERE id = ?',
    validUntilIso,
    applicationId
  );
}

export async function enrichTccApplicationRow<T extends Record<string, unknown>>(
  row: T,
  applicationId?: string
): Promise<T & { certificate_valid_until_date?: string | null }> {
  const id = applicationId ?? (typeof row.id === 'string' ? row.id : null);
  if (!id) return row;
  const existing = readTccApplicationValidUntilDate(row);
  if (existing) return { ...row, certificate_valid_until_date: existing };
  const validUntil = await fetchTccApplicationValidUntilDateById(id);
  if (validUntil == null) return row;
  return { ...row, certificate_valid_until_date: validUntil };
}

export async function enrichTccApplicationsWithValidUntil<T extends { id: string }>(
  apps: T[]
): Promise<(T & { certificate_valid_until_date?: string | null })[]> {
  if (!apps.length) return apps;
  if (!(await hasTccApplicationColumn('certificate_valid_until_date'))) return apps;

  const ids = apps.map((app) => app.id);
  const placeholders = ids.map(() => '?').join(', ');
  const rows = await prisma.$queryRawUnsafe<
    Array<{ id: string; certificate_valid_until_date: Date | string | null }>
  >(
    `SELECT id, certificate_valid_until_date FROM tcc_applications WHERE id IN (${placeholders})`,
    ...ids
  );

  const byId = new Map(
    rows.map((row) => [row.id, formatValidUntilRaw(row.certificate_valid_until_date)])
  );

  return apps.map((app) => {
    const validUntil = byId.get(app.id);
    return validUntil != null ? { ...app, certificate_valid_until_date: validUntil } : app;
  });
}

export function isMissingTccSchemaColumnError(err: unknown): boolean {
  const message =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message?: string }).message ?? '')
      : String(err ?? '');
  const lower = message.toLowerCase();
  const looksLikeMissingColumn =
    lower.includes('unknown column') ||
    lower.includes('does not exist in the current database') ||
    lower.includes('pgrst204') ||
    lower.includes('unknown field') ||
    lower.includes('unknown argument');
  if (!looksLikeMissingColumn) return false;

  return (
    message.includes('certificate_valid_until_date') ||
    message.includes('certificate_issue_date') ||
    message.includes('eu_importer') ||
    message.includes('purchase_order_number') ||
    message.includes('invoice_number') ||
    message.includes('regulatory_framework') ||
    message.includes('reach_certificate_id')
  );
}

/** @deprecated Use ensureTccApplicationSchema */
export function isMissingTccValidUntilColumnError(err: unknown): boolean {
  return isMissingTccSchemaColumnError(err);
}

/** Ensures TCC table columns exist (includes Valid Upto). */
export async function ensureTccValidUntilColumn(): Promise<boolean> {
  return ensureTccApplicationSchema();
}
