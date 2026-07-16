'use server';

import { createAdminClient } from '@/lib/db/admin';
import { getSession } from '@/lib/auth/session';
import { formatErrorMessage } from '@/lib/format-error';
import { writeActivityLog } from '@/lib/activity-log';
import { buildClientDirectoryExportBuffer } from '@/services/client-directory-export';

async function requireAdmin() {
  const session = await getSession();
  if (!session || (session.role !== 'MASTER_ADMIN' && session.role !== 'SUPER_ADMIN')) {
    return null;
  }
  return session;
}

export async function exportClientsDirectoryAction(clientIds: string[]) {
  const session = await requireAdmin();
  if (!session) {
    return { success: false as const, error: 'Unauthorized. Admins only.' };
  }

  const uniqueIds = [...new Set(clientIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { success: false as const, error: 'No clients selected for export.' };
  }

  try {
    const adminSupabase = createAdminClient();
    const buffer = await buildClientDirectoryExportBuffer(adminSupabase, uniqueIds);
    const base64 = Buffer.from(buffer).toString('base64');
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `pharmegic-clients-export-${dateStamp}.xlsx`;

    const { data: companies } = await adminSupabase
      .from('clients')
      .select('company_name')
      .in('id', uniqueIds);

    const companyNames = ((companies as { company_name?: string }[] | null) || [])
      .map((c) => c.company_name?.trim())
      .filter(Boolean) as string[];

    await writeActivityLog(adminSupabase, {
      user_id: session.userId,
      action: 'CLIENTS_EXPORTED',
      entity_type: 'clients',
      description: `Client directory exported (${uniqueIds.length} client${uniqueIds.length === 1 ? '' : 's'}): ${filename}`,
      metadata: {
        filename,
        client_count: uniqueIds.length,
        client_ids: uniqueIds,
        company_names: companyNames.slice(0, 50),
        includes_login_passwords: true,
      },
    });

    return {
      success: true as const,
      base64,
      filename,
      count: uniqueIds.length,
    };
  } catch (error) {
    return {
      success: false as const,
      error: formatErrorMessage(error) || 'Failed to export client data.',
    };
  }
}
