'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/auth/session';
import { hashPassword } from '@/lib/auth/password';
import { revalidatePath } from 'next/cache';

async function requireSuperAdmin() {
  const session = await getSession();
  if (!session || session.role !== 'SUPER_ADMIN') return null;
  return session;
}

// ============================================================================
// LIST ALL MASTER ADMINS
// ============================================================================
export async function listMasterAdminsAction() {
  const session = await requireSuperAdmin();
  if (!session) return { success: false, error: 'Unauthorized. Super Admin only.' };

  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from('users')
    .select('id, email, is_disabled, created_at')
    .eq('role', 'MASTER_ADMIN')
    .order('created_at', { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, admins: data };
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

  const { data: existing } = await adminSupabase
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  if (existing) return { success: false, error: 'A user with this email already exists.' };

  const password_hash = await hashPassword(password);
  const { error } = await adminSupabase.from('users').insert({
    email: email.toLowerCase(),
    password_hash,
    role: 'MASTER_ADMIN',
    is_disabled: false,
  });

  if (error) return { success: false, error: error.message };

  await adminSupabase.from('audit_logs').insert({
    user_id: session.userId,
    action: 'CREATE_MASTER_ADMIN',
    entity_type: 'users',
    metadata: { email },
  });

  revalidatePath('/admin/super');
  return { success: true, message: `Master Admin ${email} created successfully.` };
}

// ============================================================================
// TOGGLE MASTER ADMIN (Enable / Disable)
// ============================================================================
export async function toggleMasterAdminAction(userId: string, disable: boolean) {
  const session = await requireSuperAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase.from('users').update({ is_disabled: disable }).eq('id', userId).eq('role', 'MASTER_ADMIN');
  if (error) return { success: false, error: error.message };

  revalidatePath('/admin/super');
  return { success: true, message: disable ? 'Admin login disabled.' : 'Admin login enabled.' };
}

// ============================================================================
// REMOVE MASTER ADMIN
// ============================================================================
export async function removeMasterAdminAction(userId: string) {
  const session = await requireSuperAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase.from('users').delete().eq('id', userId).eq('role', 'MASTER_ADMIN');
  if (error) return { success: false, error: error.message };

  await adminSupabase.from('audit_logs').insert({
    user_id: session.userId,
    action: 'REMOVE_MASTER_ADMIN',
    entity_type: 'users',
    metadata: { removed_user_id: userId },
  });

  revalidatePath('/admin/super');
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
  const password_hash = await hashPassword(newPassword);
  const { error } = await adminSupabase.from('users').update({ password_hash }).eq('id', userId).eq('role', 'MASTER_ADMIN');
  if (error) return { success: false, error: error.message };

  revalidatePath('/admin/super');
  return { success: true, message: 'Admin password reset successfully.' };
}
