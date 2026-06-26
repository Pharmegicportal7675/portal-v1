import type { DbClient } from '@/lib/db/types';

export type ActivityLogRecord = {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  description: string | null;
  metadata: unknown;
  created_at: string;
  client_id: string | null;
  user_id: string | null;
  clients?: { company_name?: string | null } | null;
  users?: { email?: string | null; role?: string | null } | null;
};

function normalizeActivityLogRow(row: ActivityLogRecord): ActivityLogRecord {
  const clients = row.clients;
  const users = row.users;
  return {
    ...row,
    clients: Array.isArray(clients) ? clients[0] ?? null : clients ?? null,
    users: Array.isArray(users) ? users[0] ?? null : users ?? null,
  };
}

export async function getAllActivityLogs(
  supabase: DbClient,
  options?: { limit?: number }
): Promise<ActivityLogRecord[]> {
  const limit = options?.limit ?? 1000;

  const { data, error } = await supabase
    .from('activity_logs')
    .select(
      'id, action, entity_type, entity_id, description, metadata, created_at, client_id, user_id, clients ( company_name ), users ( email, role )'
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []).map((row: ActivityLogRecord) => normalizeActivityLogRow(row));
}
