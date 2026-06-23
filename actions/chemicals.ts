'use server';

import { createAdminClient } from '@/lib/db/admin';
import { getSession } from '@/lib/auth/session';
import { chemicalSchema } from '@/lib/validations';
import { revalidatePath } from 'next/cache';

async function requireAdmin() {
  const session = await getSession();
  if (!session || (session.role !== 'MASTER_ADMIN' && session.role !== 'SUPER_ADMIN')) return null;
  return session;
}

export async function createChemicalAction(prevState: unknown, formData: FormData) {
  const session = await requireAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const data = {
    chemical_name: formData.get('chemical_name') as string,
    cas_number: formData.get('cas_number') as string,
    ec_number: formData.get('ec_number') as string,
    tonnage_band: formData.get('tonnage_band') as string,
    validity_date: formData.get('validity_date') as string,
    available_quantity: formData.get('available_quantity') as string,
    status: (formData.get('status') as string) || 'active',
  };

  const parsed = chemicalSchema.safeParse(data);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const adminSupabase = createAdminClient();
  try {
    const { error } = await adminSupabase.from('chemicals').insert({
      ...parsed.data,
      exported_quantity: 0,
    });
    if (error) throw error;
    revalidatePath('/admin/chemicals');
    return { success: true, message: 'Substance added successfully.' };
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    return {
      success: false,
      error: e.code === '23505' ? 'A substance with this CAS number already exists.' : e.message || 'Failed to create substance.',
    };
  }
}

export async function updateChemicalAction(id: string, data: unknown) {
  const session = await requireAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const parsed = chemicalSchema.partial().safeParse(data);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const adminSupabase = createAdminClient();
  try {
    const { error } = await adminSupabase.from('chemicals').update(parsed.data).eq('id', id);
    if (error) throw error;
    revalidatePath('/admin/chemicals');
    return { success: true, message: 'Substance updated successfully.' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

export async function trashChemicalAction(id: string) {
  const session = await requireAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const adminSupabase = createAdminClient();
  try {
    const { error } = await adminSupabase
      .from('chemicals')
      .update({ status: 'trashed' })
      .eq('id', id);

    if (error) {
      if (error.code === '22P02') {
        return {
          success: false,
          error:
            'Trash is not enabled in the database yet. Run the chemical_status migration in Supabase SQL (see setup.md).',
        };
      }
      throw error;
    }
    revalidatePath('/admin/chemicals');
    return { success: true, message: 'Substance moved to trash.' };
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code === '22P02') {
      return {
        success: false,
        error:
          'Trash is not enabled in the database yet. Run the chemical_status migration in Supabase SQL (see setup.md).',
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

export async function restoreChemicalAction(id: string) {
  const session = await requireAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const adminSupabase = createAdminClient();
  try {
    const { error } = await adminSupabase
      .from('chemicals')
      .update({ status: 'active' })
      .eq('id', id)
      .eq('status', 'trashed');

    if (error) throw error;
    revalidatePath('/admin/chemicals');
    return { success: true, message: 'Substance restored from trash.' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

export async function permanentDeleteChemicalAction(id: string) {
  const session = await requireAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const adminSupabase = createAdminClient();
  try {
    const { error } = await adminSupabase.from('chemicals').delete().eq('id', id);
    if (error) throw error;
    revalidatePath('/admin/chemicals');
    revalidatePath('/admin/clients');
    return { success: true, message: 'Substance permanently deleted.' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
