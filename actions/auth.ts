'use server';

import { createAdminClient } from '@/lib/db/admin';
import { writeActivityLog } from '@/lib/activity-log';
import { destroySession, getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';

// ============================================================================
// LOGOUT
// ============================================================================
export async function logout() {
  const session = await getSession();

  if (session) {
    try {
      await writeActivityLog(createAdminClient(), {
        client_id: session.clientId ?? null,
        user_id: session.userId,
        action: 'USER_LOGOUT',
        entity_type: 'users',
        entity_id: session.userId,
        description: `${session.email} logged out (${session.role.replace(/_/g, ' ')})`,
        metadata: {
          email: session.email,
          role: session.role,
        },
      });
    } catch (err) {
      console.error('[auth] Failed to write logout activity log', err);
    }
  }

  await destroySession();
  revalidatePath('/admin/activity-logs');
  return { success: true as const };
}
