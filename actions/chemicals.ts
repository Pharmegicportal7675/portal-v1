'use server';

import { createAdminClient } from '@/lib/db/admin';
import { getSession } from '@/lib/auth/session';
import { chemicalSchema } from '@/lib/validations';
import { normalizeDateInput } from '@/lib/parse-flexible-date';
import { writeActivityLog } from '@/lib/activity-log';
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
    is_intermediate_substance: formData.get('is_intermediate_substance') === 'true',
  };

  const parsed = chemicalSchema.safeParse(data);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const validity = normalizeDateInput(parsed.data.validity_date, 'Validity date');
  if (!validity.ok) return { success: false, error: validity.error };

  const adminSupabase = createAdminClient();
  try {
    const { data: created, error } = await adminSupabase
      .from('chemicals')
      .insert({
        ...parsed.data,
        validity_date: validity.iso,
        exported_quantity: 0,
      })
      .select('id, chemical_name, cas_number')
      .single();
    if (error) throw error;

    await writeActivityLog(adminSupabase, {
      user_id: session.userId,
      action: 'GLOBAL_CHEMICAL_CREATED',
      entity_type: 'chemicals',
      entity_id: (created as { id?: string } | null)?.id ?? null,
      description: `Global substance created: ${parsed.data.chemical_name} (CAS ${parsed.data.cas_number})`,
      metadata: {
        chemical_name: parsed.data.chemical_name,
        cas_number: parsed.data.cas_number,
        tonnage_band: parsed.data.tonnage_band,
      },
    });

    revalidatePath('/admin/chemicals');
    revalidatePath('/admin/activity-logs');
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

  const updateData = { ...parsed.data };
  if (updateData.validity_date !== undefined) {
    const validity = normalizeDateInput(updateData.validity_date, 'Validity date');
    if (!validity.ok) return { success: false, error: validity.error };
    updateData.validity_date = validity.iso;
  }

  const adminSupabase = createAdminClient();
  try {
    const { data: before } = await adminSupabase
      .from('chemicals')
      .select('chemical_name, cas_number')
      .eq('id', id)
      .maybeSingle();

    const { error } = await adminSupabase.from('chemicals').update(updateData).eq('id', id);
    if (error) throw error;

    const name =
      (updateData.chemical_name as string | undefined) ||
      (before as { chemical_name?: string } | null)?.chemical_name ||
      id;
    const cas =
      (updateData.cas_number as string | undefined) ||
      (before as { cas_number?: string } | null)?.cas_number ||
      '';

    await writeActivityLog(adminSupabase, {
      user_id: session.userId,
      action: 'GLOBAL_CHEMICAL_UPDATED',
      entity_type: 'chemicals',
      entity_id: id,
      description: `Global substance updated: ${name}${cas ? ` (CAS ${cas})` : ''}`,
      metadata: { chemical_name: name, cas_number: cas, updated_fields: Object.keys(updateData) },
    });

    revalidatePath('/admin/chemicals');
    revalidatePath('/admin/activity-logs');
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
    const { data: before } = await adminSupabase
      .from('chemicals')
      .select('chemical_name, cas_number')
      .eq('id', id)
      .maybeSingle();

    const { error } = await adminSupabase
      .from('chemicals')
      .update({ status: 'trashed' })
      .eq('id', id);

    if (error) {
      if (error.code === '22P02') {
        return {
          success: false,
          error:
            'Trash is not enabled in the database yet. Run npm run db:import or apply the chemical_status migration in prisma/database.mysql.sql.',
        };
      }
      throw error;
    }

    const chem = before as { chemical_name?: string; cas_number?: string } | null;
    await writeActivityLog(adminSupabase, {
      user_id: session.userId,
      action: 'GLOBAL_CHEMICAL_TRASHED',
      entity_type: 'chemicals',
      entity_id: id,
      description: `Global substance moved to trash: ${chem?.chemical_name || id}${chem?.cas_number ? ` (CAS ${chem.cas_number})` : ''}`,
      metadata: { chemical_name: chem?.chemical_name, cas_number: chem?.cas_number },
    });

    revalidatePath('/admin/chemicals');
    revalidatePath('/admin/activity-logs');
    return { success: true, message: 'Substance moved to trash.' };
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code === '22P02') {
      return {
        success: false,
        error:
          'Trash is not enabled in the database yet. Run npm run db:import or apply the chemical_status migration in prisma/database.mysql.sql.',
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
    const { data: before } = await adminSupabase
      .from('chemicals')
      .select('chemical_name, cas_number')
      .eq('id', id)
      .maybeSingle();

    const { error } = await adminSupabase
      .from('chemicals')
      .update({ status: 'active' })
      .eq('id', id)
      .eq('status', 'trashed');

    if (error) throw error;

    const chem = before as { chemical_name?: string; cas_number?: string } | null;
    await writeActivityLog(adminSupabase, {
      user_id: session.userId,
      action: 'GLOBAL_CHEMICAL_RESTORED',
      entity_type: 'chemicals',
      entity_id: id,
      description: `Global substance restored: ${chem?.chemical_name || id}${chem?.cas_number ? ` (CAS ${chem.cas_number})` : ''}`,
      metadata: { chemical_name: chem?.chemical_name, cas_number: chem?.cas_number },
    });

    revalidatePath('/admin/chemicals');
    revalidatePath('/admin/activity-logs');
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
    const { data: before } = await adminSupabase
      .from('chemicals')
      .select('chemical_name, cas_number')
      .eq('id', id)
      .maybeSingle();

    const { error } = await adminSupabase.from('chemicals').delete().eq('id', id);
    if (error) throw error;

    const chem = before as { chemical_name?: string; cas_number?: string } | null;
    await writeActivityLog(adminSupabase, {
      user_id: session.userId,
      action: 'GLOBAL_CHEMICAL_PERMANENTLY_DELETED',
      entity_type: 'chemicals',
      entity_id: id,
      description: `Global substance permanently deleted: ${chem?.chemical_name || id}${chem?.cas_number ? ` (CAS ${chem.cas_number})` : ''}`,
      metadata: { chemical_name: chem?.chemical_name, cas_number: chem?.cas_number },
    });

    revalidatePath('/admin/chemicals');
    revalidatePath('/admin/clients');
    revalidatePath('/admin/activity-logs');
    return { success: true, message: 'Substance permanently deleted.' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
