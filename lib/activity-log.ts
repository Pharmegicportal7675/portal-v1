import 'server-only';

import type { DbClient } from '@/lib/db/types';
import { getActivityRequestContext } from '@/lib/activity-request-context';

export {
  buildActivityFieldChanges,
  formatActivityFieldChangesDescription,
  CONTACT_FIELD_LABELS,
  CLIENT_PROFILE_FIELD_LABELS,
} from '@/lib/activity-log-fields';

export async function writeActivityLog(
  supabase: DbClient,
  entry: {
    client_id?: string | null;
    user_id?: string | null;
    action: string;
    entity_type?: string | null;
    entity_id?: string | null;
    description: string;
    metadata?: unknown;
    ip_address?: string | null;
    location?: string | null;
  }
): Promise<void> {
  const requestCtx =
    entry.ip_address !== undefined || entry.location !== undefined
      ? {
          ip_address: entry.ip_address ?? null,
          location: entry.location ?? null,
        }
      : await getActivityRequestContext();

  const { error } = await supabase.from('activity_logs').insert({
    client_id: entry.client_id ?? null,
    user_id: entry.user_id ?? null,
    action: entry.action,
    entity_type: entry.entity_type ?? null,
    entity_id: entry.entity_id ?? null,
    description: entry.description,
    metadata: entry.metadata ?? null,
    ip_address: requestCtx.ip_address,
    location: requestCtx.location,
  });
  if (error) {
    // Older DBs without ip/location columns — retry without them so logging never breaks the app.
    if (/unknown column|does not exist|ip_address|location/i.test(error.message || '')) {
      const retry = await supabase.from('activity_logs').insert({
        client_id: entry.client_id ?? null,
        user_id: entry.user_id ?? null,
        action: entry.action,
        entity_type: entry.entity_type ?? null,
        entity_id: entry.entity_id ?? null,
        description: entry.description,
        metadata: entry.metadata ?? null,
      });
      if (retry.error) {
        console.error('[activity_logs]', entry.action, retry.error.message || retry.error);
      }
      return;
    }
    console.error('[activity_logs]', entry.action, error.message || error);
  }
}
