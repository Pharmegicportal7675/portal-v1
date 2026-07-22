'use server';

import { createAdminClient } from '@/lib/db/admin';
import { getSession } from '@/lib/auth/session';
import { hashPassword } from '@/lib/auth/password';
import { formatErrorMessage } from '@/lib/format-error';
import { findPortalEmailConflict } from '@/lib/portal-email-check';
import { writeActivityLog } from '@/lib/activity-log';
import { revalidatePath } from 'next/cache';

async function requireSuperAdmin() {
  const session = await getSession();
  if (!session || session.role !== 'SUPER_ADMIN') return null;
  return session;
}

// ============================================================================
// CREATE MASTER ADMIN
// ============================================================================
export async function createMasterAdminAction(email: string, password: string) {
  const session = await requireSuperAdmin();
  if (!session) return { success: false, error: 'Unauthorized. Super Admin only.' };

  if (!email || !password || password.length < 6) {
    return { success: false, error: 'Valid email and password (min 6 chars) are required.' };
  }

  const adminSupabase = createAdminClient();
  const emailLower = email.toLowerCase();

  const emailConflict = await findPortalEmailConflict(adminSupabase, emailLower);
  if (emailConflict) return { success: false, error: emailConflict };

  const password_hash = await hashPassword(password);
  const { data: created, error } = await adminSupabase
    .from('users')
    .insert({
      email: emailLower,
      password_hash,
      login_password: password,
      role: 'MASTER_ADMIN',
      is_disabled: false,
    })
    .select('id, email')
    .single();

  if (error) return { success: false, error: formatErrorMessage(error) };

  await adminSupabase.from('audit_logs').insert({
    user_id: session.userId,
    action: 'CREATE_MASTER_ADMIN',
    entity_type: 'users',
    metadata: { email: emailLower },
  });

  await writeActivityLog(adminSupabase, {
    user_id: session.userId,
    action: 'CREATE_MASTER_ADMIN',
    entity_type: 'users',
    entity_id: (created as { id?: string } | null)?.id ?? null,
    description: `Master Admin created: ${emailLower}`,
    metadata: { email: emailLower },
  });

  revalidatePath('/admin/super');
  revalidatePath('/admin/activity-logs');
  return { success: true, message: `Master Admin ${email} created successfully.` };
}

// ============================================================================
// TOGGLE MASTER ADMIN (Enable / Disable)
// ============================================================================
export async function toggleMasterAdminAction(userId: string, disable: boolean) {
  const session = await requireSuperAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const adminSupabase = createAdminClient();
  const { data: target } = await adminSupabase
    .from('users')
    .select('id, email')
    .eq('id', userId)
    .eq('role', 'MASTER_ADMIN')
    .maybeSingle();

  const { error } = await adminSupabase
    .from('users')
    .update({ is_disabled: disable })
    .eq('id', userId)
    .eq('role', 'MASTER_ADMIN');
  if (error) return { success: false, error: error.message };

  const email = (target as { email?: string } | null)?.email || userId;
  await writeActivityLog(adminSupabase, {
    user_id: session.userId,
    action: disable ? 'MASTER_ADMIN_DISABLED' : 'MASTER_ADMIN_ENABLED',
    entity_type: 'users',
    entity_id: userId,
    description: disable
      ? `Master Admin login disabled: ${email}`
      : `Master Admin login enabled: ${email}`,
    metadata: { email, disabled: disable },
  });

  revalidatePath('/admin/super');
  revalidatePath('/admin/activity-logs');
  return { success: true, message: disable ? 'Admin login disabled.' : 'Admin login enabled.' };
}

// ============================================================================
// REMOVE MASTER ADMIN
// ============================================================================
export async function removeMasterAdminAction(userId: string) {
  const session = await requireSuperAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const adminSupabase = createAdminClient();
  const { data: target } = await adminSupabase
    .from('users')
    .select('id, email')
    .eq('id', userId)
    .eq('role', 'MASTER_ADMIN')
    .maybeSingle();

  const { error } = await adminSupabase.from('users').delete().eq('id', userId).eq('role', 'MASTER_ADMIN');
  if (error) return { success: false, error: error.message };

  const email = (target as { email?: string } | null)?.email || userId;
  await adminSupabase.from('audit_logs').insert({
    user_id: session.userId,
    action: 'REMOVE_MASTER_ADMIN',
    entity_type: 'users',
    metadata: { removed_user_id: userId, email },
  });

  await writeActivityLog(adminSupabase, {
    user_id: session.userId,
    action: 'REMOVE_MASTER_ADMIN',
    entity_type: 'users',
    entity_id: userId,
    description: `Master Admin removed: ${email}`,
    metadata: { removed_user_id: userId, email },
  });

  revalidatePath('/admin/super');
  revalidatePath('/admin/activity-logs');
  return { success: true, message: 'Master Admin removed.' };
}

// ============================================================================
// RESET MASTER ADMIN PASSWORD
// ============================================================================
export async function resetMasterAdminPasswordAction(userId: string, newPassword: string) {
  const session = await requireSuperAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  if (newPassword.length < 6) return { success: false, error: 'Password must be at least 6 characters.' };

  const adminSupabase = createAdminClient();
  const { data: target } = await adminSupabase
    .from('users')
    .select('id, email')
    .eq('id', userId)
    .eq('role', 'MASTER_ADMIN')
    .maybeSingle();

  const password_hash = await hashPassword(newPassword);
  const { error } = await adminSupabase
    .from('users')
    .update({ password_hash, login_password: newPassword })
    .eq('id', userId)
    .eq('role', 'MASTER_ADMIN');
  if (error) return { success: false, error: error.message };

  const email = (target as { email?: string } | null)?.email || userId;
  await writeActivityLog(adminSupabase, {
    user_id: session.userId,
    action: 'MASTER_ADMIN_PASSWORD_RESET',
    entity_type: 'users',
    entity_id: userId,
    description: `Master Admin password reset: ${email}`,
    metadata: { email },
  });

  revalidatePath('/admin/super');
  revalidatePath('/admin/activity-logs');
  return { success: true, message: 'Admin password reset successfully.' };
}
