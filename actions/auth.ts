'use server';

import { destroySession } from '@/lib/auth/session';

// ============================================================================
// LOGOUT
// ============================================================================
export async function logout() {
  await destroySession();
  return { success: true as const };
}
