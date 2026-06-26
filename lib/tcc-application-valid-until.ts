import { ensureTccApplicationSchema } from '@/lib/tcc-application-schema';

/** Read optional valid-until date from a tcc_applications row. */
export function readTccApplicationValidUntilDate(
  app: { certificate_valid_until_date?: string | null } | Record<string, unknown>
): string | null {
  const raw =
    'certificate_valid_until_date' in app ? app.certificate_valid_until_date : undefined;
  if (raw == null || raw === '') return null;
  return String(raw).split('T')[0];
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
    lower.includes('pgrst204');
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
