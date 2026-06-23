/**
 * Turns Supabase/PostgREST and other thrown values into a readable string.
 * Plain objects stringify as "[object Object]" — avoid showing that in the UI.
 */
export function formatErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const record = err as Record<string, unknown>;
    if (typeof record.message === 'string' && record.message.trim()) {
      const msg = record.message;
      if (msg.includes('client_chemicals_assigned_by_fkey') || msg.includes('is not present in table "users"')) {
        return 'Your login session is out of date. Please log out, log in again, then retry.';
      }
      const code = typeof record.code === 'string' ? record.code : '';
      const details = typeof record.details === 'string' ? record.details : '';
      const hint = typeof record.hint === 'string' ? record.hint : '';
      return [msg, code && `(${code})`, details, hint].filter(Boolean).join(' — ');
    }
    if (typeof record.error_description === 'string') return record.error_description;
  }
  return 'An unexpected error occurred.';
}
