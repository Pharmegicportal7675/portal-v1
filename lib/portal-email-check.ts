import {
  extractDbErrorCode,
  extractDbErrorMessage,
  formatFriendlyUniqueConstraintError,
} from '@/lib/db-errors';
import type { DbClient } from '@/lib/db/types';
import { formatUserEmailConflictMessage } from '@/lib/db-errors';

export async function findPortalEmailConflict(
  adminSupabase: DbClient,
  email: string,
  options?: { excludeClientId?: string; excludeUserId?: string }
): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  let clientQuery = adminSupabase.from('clients').select('id').eq('email', normalized);
  if (options?.excludeClientId) {
    clientQuery = clientQuery.neq('id', options.excludeClientId);
  }
  const { data: existingClient } = await clientQuery.maybeSingle();
  if (existingClient) {
    return 'A client with this email already exists.';
  }

  let userQuery = adminSupabase.from('users').select('id, role, client_id').eq('email', normalized);
  if (options?.excludeUserId) {
    userQuery = userQuery.neq('id', options.excludeUserId);
  }
  const { data: existingUser } = await userQuery.maybeSingle();
  if (existingUser) {
    return formatUserEmailConflictMessage(
      (existingUser as { role?: string | null }).role
    );
  }

  return null;
}

export async function findPortalUuidConflict(
  adminSupabase: DbClient,
  uuidNumber: string,
  excludeClientId?: string
): Promise<string | null> {
  const normalized = uuidNumber.trim();
  if (!normalized) return null;

  let query = adminSupabase.from('clients').select('id').eq('uuid_number', normalized);
  if (excludeClientId) {
    query = query.neq('id', excludeClientId);
  }
  const { data: existing } = await query.maybeSingle();
  if (existing) {
    return 'This UUID / company reference number is already assigned to another client.';
  }
  return null;
}

export { formatUserEmailConflictMessage };
