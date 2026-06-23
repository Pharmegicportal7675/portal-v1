'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/auth/session';
import { formatErrorMessage } from '@/lib/format-error';
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

    return {
      success: true as const,
      base64,
      filename: `pharmegic-clients-export-${dateStamp}.xlsx`,
      count: uniqueIds.length,
    };
  } catch (error) {
    return {
      success: false as const,
      error: formatErrorMessage(error) || 'Failed to export client data.',
    };
  }
}
