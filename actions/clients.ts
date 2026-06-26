'use server';

import { createAdminClient } from '@/lib/db/admin';
import { getSession } from '@/lib/auth/session';
import { hashPassword } from '@/lib/auth/password';
import { formatErrorMessage } from '@/lib/format-error';
import { findPortalEmailConflict } from '@/lib/portal-email-check';
import { normalizeDateInput, normalizeOptionalDateInput } from '@/lib/parse-flexible-date';
import { getTonnageBandMaxQuota, sumApprovedExports, sumApprovedExportsInReachWindow, getRemainingQuotaForReachPeriod, computeAssignableQuota, type TccExportRecord } from '@/lib/quota';
import {
  clientHasEuReachRegistration,
  EU_REACH_CERTIFICATE_REQUIRED_MESSAGE,
} from '@/lib/regulatory-registrations';
import { internalNoteSchema, changeEmailSchema, changePasswordSchema } from '@/lib/validations';
import { revalidatePath } from 'next/cache';
import {
  deleteClientExclusiveChemicals,
  deleteClientStorageFilesAndFolders,
} from '@/lib/client-storage-cleanup';
import { normalizeCasNumber } from '@/lib/client-directory-import';
import { findChemicalIdByNormalizedCas } from '@/services/client-directory-import';

// ============================================================================
// HELPER: Verify admin session
// ============================================================================
async function requireAdmin() {
  const session = await getSession();
  if (!session || (session.role !== 'MASTER_ADMIN' && session.role !== 'SUPER_ADMIN')) {
    return null;
  }
  return session;
}

async function getClientYearExportedMt(
  adminSupabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  chemicalId: string
) {
  const { data } = await adminSupabase
    .from('tcc_applications')
    .select('chemical_id, quantity_mt, status, export_date, updated_at, created_at, certificates!certificates_tcc_application_id_fkey(issued_at)')
    .eq('client_id', clientId)
    .eq('chemical_id', chemicalId)
    .eq('status', 'approved');

  return sumApprovedExports(data || [], chemicalId);
}

// ============================================================================
// UPDATE CLIENT PROFILE
// ============================================================================
export async function updateClientAction(clientId: string, profile: Record<string, unknown>, chemicalIds?: string[]) {
  const session = await requireAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const adminSupabase = createAdminClient();
  try {
    const {
      legal_name: _legalName,
      registration_number: _registrationNumber,
      ...clientProfile
    } = profile;

    const { error } = await adminSupabase
      .from('clients')
      .update({ ...clientProfile, updated_at: new Date().toISOString() })
      .eq('id', clientId);

    if (error) throw error;

    if (chemicalIds !== undefined) {
      // Sync client chemicals
      await adminSupabase.from('client_chemicals').delete().eq('client_id', clientId);
      if (chemicalIds.length > 0) {
        const insertRows = chemicalIds.map(cid => ({
          client_id: clientId,
          chemical_id: cid,
          available_quantity: 0, // Assigned via client detail page later or default to 0
          status: 'active'
        }));
        await adminSupabase.from('client_chemicals').insert(insertRows);
      }
    }

    await adminSupabase.from('activity_logs').insert({
      client_id: clientId,
      user_id: session.userId,
      action: 'CLIENT_UPDATED',
      entity_type: 'clients',
      entity_id: clientId,
      description: 'Client profile updated by admin',
    });

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath('/admin/clients');
    return { success: true, message: 'Client profile updated successfully.' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

// ============================================================================
// CHANGE CLIENT EMAIL (Admin only)
// ============================================================================
export async function changeClientEmailAction(clientId: string, newEmail: string) {
  const session = await requireAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const parsed = changeEmailSchema.safeParse({ new_email: newEmail });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const adminSupabase = createAdminClient();
  try {
    const emailLower = newEmail.toLowerCase();

    const { data: loginUser } = await adminSupabase
      .from('users')
      .select('id')
      .eq('client_id', clientId)
      .maybeSingle();

    const emailConflict = await findPortalEmailConflict(adminSupabase, emailLower, {
      excludeClientId: clientId,
      excludeUserId: loginUser?.id,
    });
    if (emailConflict) return { success: false, error: emailConflict };

    // Update clients table
    const { error: cErr } = await adminSupabase.from('clients').update({ email: emailLower }).eq('id', clientId);
    if (cErr) throw cErr;

    // Update users table
    const { error: uErr } = await adminSupabase.from('users').update({ email: emailLower }).eq('client_id', clientId);
    if (uErr) throw uErr;

    await adminSupabase.from('activity_logs').insert({
      client_id: clientId,
      user_id: session.userId,
      action: 'EMAIL_CHANGED',
      entity_type: 'clients',
      entity_id: clientId,
      description: `Client email changed to ${emailLower}`,
    });

    revalidatePath(`/admin/clients/${clientId}`);
    return { success: true, message: 'Client email updated successfully.' };
  } catch (err) {
    return { success: false, error: formatErrorMessage(err) };
  }
}

// ============================================================================
// CHANGE CLIENT PASSWORD (Admin only)
// ============================================================================
export async function changeClientPasswordAction(clientId: string, newPassword: string) {
  const session = await requireAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const parsed = changePasswordSchema.safeParse({ new_password: newPassword });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const adminSupabase = createAdminClient();
  try {
    const password_hash = await hashPassword(newPassword);
    const { error } = await adminSupabase
      .from('users')
      .update({ password_hash, login_password: newPassword })
      .eq('client_id', clientId);
    if (error) throw error;

    await adminSupabase.from('activity_logs').insert({
      client_id: clientId,
      user_id: session.userId,
      action: 'PASSWORD_CHANGED',
      entity_type: 'users',
      entity_id: clientId,
      description: 'Client password changed by admin',
    });

    revalidatePath(`/admin/clients/${clientId}`);
    return { success: true, message: 'Password updated successfully.' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

// ============================================================================
// TOGGLE CLIENT LOGIN (Enable / Disable)
// ============================================================================
export async function toggleClientLoginAction(clientId: string, disable: boolean) {
  const session = await requireAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const adminSupabase = createAdminClient();
  try {
    const { error } = await adminSupabase.from('users').update({ is_disabled: disable }).eq('client_id', clientId);
    if (error) throw error;

    await adminSupabase.from('activity_logs').insert({
      client_id: clientId,
      user_id: session.userId,
      action: disable ? 'LOGIN_DISABLED' : 'LOGIN_ENABLED',
      entity_type: 'users',
      entity_id: clientId,
      description: disable ? 'Client login disabled by admin' : 'Client login re-enabled by admin',
    });

    revalidatePath(`/admin/clients/${clientId}`);
    return { success: true, message: disable ? 'Client login disabled.' : 'Client login enabled.' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

// ============================================================================
// DELETE CLIENT
// ============================================================================
export async function deleteClientAction(clientId: string) {
  const session = await requireAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const adminSupabase = createAdminClient();
  try {
    const { data: client, error: fetchError } = await adminSupabase
      .from('clients')
      .select('id, company_name')
      .eq('id', clientId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!client) return { success: false, error: 'Client not found.' };

    await deleteClientStorageFilesAndFolders(adminSupabase, clientId, client.company_name);
    await deleteClientExclusiveChemicals(adminSupabase, clientId);

    // Delete user credentials first (users.client_id FK is SET NULL, not CASCADE)
    const { error: userError } = await adminSupabase.from('users').delete().eq('client_id', clientId);
    if (userError) throw userError;

    // Cascades: contacts, client_chemicals, TCC applications, certificates, notes, activity logs
    const { error: clientError } = await adminSupabase.from('clients').delete().eq('id', clientId);
    if (clientError) throw clientError;

    revalidatePath('/admin/clients');
    revalidatePath('/admin/chemicals');
    revalidatePath('/admin/rc-certificates');
    revalidatePath('/admin/approvals');
    revalidatePath(`/admin/clients/${clientId}`);
    return {
      success: true,
      message: `${client.company_name}, assigned substances, certificate files, and storage folders deleted permanently.`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

export async function deleteSelectedClientsAction(clientIds: string[]) {
  const session = await requireAdmin();
  if (!session || session.role !== 'SUPER_ADMIN') {
    return { success: false, error: 'Only Super Admin can bulk delete clients.' };
  }

  const uniqueIds = [...new Set((clientIds || []).map((id) => String(id).trim()).filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { success: false, error: 'No clients selected for deletion.' };
  }

  const adminSupabase = createAdminClient();
  const deletedCompanies: string[] = [];
  const failed: string[] = [];

  for (const clientId of uniqueIds) {
    try {
      const { data: client, error: fetchError } = await adminSupabase
        .from('clients')
        .select('id, company_name')
        .eq('id', clientId)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!client) {
        failed.push(`${clientId}: Client not found.`);
        continue;
      }

      await deleteClientStorageFilesAndFolders(adminSupabase, clientId, client.company_name);
      await deleteClientExclusiveChemicals(adminSupabase, clientId);

      const { error: userError } = await adminSupabase.from('users').delete().eq('client_id', clientId);
      if (userError) throw userError;

      const { error: clientError } = await adminSupabase.from('clients').delete().eq('id', clientId);
      if (clientError) throw clientError;

      deletedCompanies.push(client.company_name);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failed.push(`${clientId}: ${message}`);
    }
  }

  revalidatePath('/admin/clients');
  revalidatePath('/admin/chemicals');
  revalidatePath('/admin/rc-certificates');
  revalidatePath('/admin/approvals');

  if (failed.length > 0) {
    return {
      success: deletedCompanies.length > 0,
      error: `Deleted ${deletedCompanies.length} clients, ${failed.length} failed.`,
      deletedCompanies,
      failed,
    };
  }

  return {
    success: true,
    message: `${deletedCompanies.length} selected clients and related RC/TCC data deleted permanently.`,
    deletedCompanies,
  };
}

// ============================================================================
// ADD NEW CHEMICAL AND ASSIGN TO CLIENT
// ============================================================================
export async function addNewChemicalToClientAction(clientId: string, data: any) {
  const session = await requireAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  if (!data.chemical_name?.trim()) return { success: false, error: 'Substance name is required.' };

  const casNumber = normalizeCasNumber(data.cas_number || '');
  if (!casNumber) return { success: false, error: 'CAS number is required.' };

  const registrationNumber = data.registration_number?.trim();
  if (!registrationNumber) return { success: false, error: 'Registration number is required.' };

  const ecNumber = data.ec_number?.trim();
  if (!ecNumber) return { success: false, error: 'EC number is required.' };

  if (!data.issued_date?.trim()) return { success: false, error: 'Issued date is required.' };
  if (!data.validated_date?.trim()) return { success: false, error: 'Validated date is required.' };

  const issuedDateResult = normalizeDateInput(data.issued_date, 'Issued date');
  if (!issuedDateResult.ok) return { success: false, error: issuedDateResult.error };
  const validatedDateResult = normalizeDateInput(data.validated_date, 'Validated date');
  if (!validatedDateResult.ok) return { success: false, error: validatedDateResult.error };

  const issuedDate = issuedDateResult.iso;
  const validatedDate = validatedDateResult.iso;
  if (validatedDate < issuedDate) {
    return { success: false, error: 'Validated date cannot be before issued date.' };
  }

  const adminSupabase = createAdminClient();
  let chemicalId: string | undefined;
  let isNewOrRestored = false;
  let existingLink: { id: string; status: string } | null = null;

  try {
    const { data: clientProfile, error: clientProfileError } = await adminSupabase
      .from('clients')
      .select('regulatory_registrations')
      .eq('id', clientId)
      .single();

    if (clientProfileError || !clientProfile) {
      return { success: false, error: 'Client not found.' };
    }

    if (!clientHasEuReachRegistration(clientProfile.regulatory_registrations)) {
      return { success: false, error: EU_REACH_CERTIFICATE_REQUIRED_MESSAGE };
    }

    const targetChemicalId = data.target_chemical_id?.trim() || null;

    if (targetChemicalId) {
      const { data: targetChem, error: targetErr } = await adminSupabase
        .from('chemicals')
        .select('id')
        .eq('id', targetChemicalId)
        .maybeSingle();

      if (targetErr) throw targetErr;
      if (!targetChem) {
        return { success: false, error: 'Assigned substance not found on this client.' };
      }

      chemicalId = targetChem.id;
      await adminSupabase
        .from('chemicals')
        .update({
          chemical_name: data.chemical_name.trim(),
          cas_number: casNumber,
          ec_number: ecNumber,
          tonnage_band: data.tonnage_band || null,
        })
        .eq('id', chemicalId);
    } else {
    // 1. Reuse existing chemical by CAS, or create new
    chemicalId = (await findChemicalIdByNormalizedCas(adminSupabase, casNumber)) ?? undefined;

    if (!chemicalId) {
      const { data: newChem, error: chemErr } = await adminSupabase
        .from('chemicals')
        .insert({
          chemical_name: data.chemical_name.trim(),
          cas_number: casNumber,
          ec_number: ecNumber,
          tonnage_band: data.tonnage_band || null,
          status: 'active',
        })
        .select('id')
        .single();

      if (chemErr) throw chemErr;
      chemicalId = newChem.id;
    } else {
      await adminSupabase
        .from('chemicals')
        .update({
          chemical_name: data.chemical_name.trim(),
          ec_number: ecNumber,
          tonnage_band: data.tonnage_band || null,
        })
        .eq('id', chemicalId);
    }
    }

    if (!chemicalId) {
      return { success: false, error: 'Failed to resolve substance.' };
    }

    const bandMax = getTonnageBandMaxQuota(data.tonnage_band);
    let assignable = 0;

    const { data: linkRow } = await adminSupabase
      .from('client_chemicals')
      .select('id, status')
      .eq('client_id', clientId)
      .eq('chemical_id', chemicalId)
      .maybeSingle();

    existingLink = linkRow;
    isNewOrRestored = !(existingLink && existingLink.status !== 'trashed');

    if (!existingLink || existingLink.status === 'trashed') {
      const exportedMt = await getClientYearExportedMt(adminSupabase, clientId, chemicalId);
      const quotaResult = computeAssignableQuota(bandMax, exportedMt);
      if (quotaResult.error) {
        return { success: false, error: quotaResult.error };
      }
      assignable = quotaResult.assignable;
    }

    if (existingLink && existingLink.status !== 'trashed') {
      const allocatedBandMax = getTonnageBandMaxQuota(data.tonnage_band);
      const allocatedQty = data.available_quantity
        ? Number(data.available_quantity)
        : (allocatedBandMax ?? 0);
      const rcResult = await (
        await import('@/actions/reach')
      ).createReachCertificate({
        clientId,
        chemicalId,
        userId: session.userId,
        registrationNumber,
        issuedDate,
        validatedDate,
        allocatedQuantity: allocatedQty,
        tonnageBand: data.tonnage_band,
      });

      if (!rcResult.success) {
        return { success: false, error: rcResult.error };
      }

      const { data: approvedApps } = await adminSupabase
        .from('tcc_applications')
        .select('id, chemical_id, quantity_mt, status, export_date, reach_certificate_id')
        .eq('client_id', clientId)
        .eq('chemical_id', chemicalId)
        .eq('status', 'approved');

      const exportedInWindow = sumApprovedExportsInReachWindow(
        approvedApps || [],
        chemicalId,
        {
          id: rcResult.certificateId!,
          issued_at: issuedDate,
          expires_at: validatedDate,
        }
      );
      const remainingQuota = getRemainingQuotaForReachPeriod(
        exportedInWindow,
        data.tonnage_band,
        allocatedQty
      );

      await adminSupabase
        .from('client_chemicals')
        .update({
          available_quantity: remainingQuota,
          validity_date: validatedDate,
          registration_number: registrationNumber,
          issued_date: issuedDate,
          certificate_number: rcResult.certNumber,
        })
        .eq('id', existingLink.id);

      await adminSupabase.from('chemicals').update({
        chemical_name: data.chemical_name.trim(),
        ec_number: ecNumber,
        tonnage_band: data.tonnage_band || null,
      }).eq('id', chemicalId);

      await adminSupabase.from('activity_logs').insert({
        client_id: clientId,
        user_id: session.userId,
        action: 'REACH_CERTIFICATE_ISSUED',
        entity_type: 'certificates',
        entity_id: rcResult.certificateId,
        description: `New year RC certificate for ${data.chemical_name.trim()}`,
      });

      revalidatePath(`/admin/clients/${clientId}`);
      revalidatePath(`/admin/clients/${clientId}/chemicals`);
      revalidatePath(`/admin/clients/${clientId}/rc-certificates`);
      return {
        success: true,
        message: `RC Certificate issued for ${data.chemical_name.trim()} (${issuedDate.slice(0, 4)}). Previous certificates remain on record.`,
        certificateId: rcResult.certificateId,
      };
    }

    if (existingLink?.status === 'trashed') {
      const { error: restoreErr } = await adminSupabase
        .from('client_chemicals')
        .update({
          available_quantity: assignable,
          validity_date: validatedDate,
          registration_number: registrationNumber,
          issued_date: issuedDate,
          status: 'active',
          assigned_by: session.userId,
        })
        .eq('id', existingLink.id);

      if (restoreErr) throw restoreErr;
    } else {
      const { error: assignErr } = await adminSupabase.from('client_chemicals').insert({
        client_id: clientId,
        chemical_id: chemicalId,
        available_quantity: assignable,
        validity_date: validatedDate,
        registration_number: registrationNumber,
        issued_date: issuedDate,
        status: 'active',
        assigned_by: session.userId,
      });

      if (assignErr) throw assignErr;
    }

    await adminSupabase.from('activity_logs').insert({
      client_id: clientId,
      user_id: session.userId,
      action: 'CHEMICAL_ASSIGNED',
      entity_type: 'client_chemicals',
      entity_id: chemicalId,
      description: `Added and assigned new substance: ${data.chemical_name}`,
    });

    const bandMaxNew = getTonnageBandMaxQuota(data.tonnage_band);
    const allocatedQtyNew = data.available_quantity
      ? Number(data.available_quantity)
      : (bandMaxNew ?? 0);
    const rcResult = await (
      await import('@/actions/reach')
    ).createReachCertificate({
      clientId,
      chemicalId,
      userId: session.userId,
      registrationNumber,
      issuedDate,
      validatedDate,
      allocatedQuantity: allocatedQtyNew,
      tonnageBand: data.tonnage_band,
    });

    if (!rcResult.success) {
      await adminSupabase
        .from('client_chemicals')
        .update({ status: 'trashed' })
        .eq('client_id', clientId)
        .eq('chemical_id', chemicalId);
      return { success: false, error: rcResult.error };
    }

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath(`/admin/clients/${clientId}/rc-certificates`);
    return {
      success: true,
      message: 'Substance assigned and RC Certificate issued.',
      certificateId: rcResult.certificateId,
    };
  } catch (err) {
    console.error('[ASSIGN CHEMICAL ERROR]:', err);
    if (isNewOrRestored && chemicalId) {
      try {
        const adminSupabase = createAdminClient();
        await adminSupabase
          .from('client_chemicals')
          .update({ status: 'trashed' })
          .eq('client_id', clientId)
          .eq('chemical_id', chemicalId);
      } catch (cleanupErr) {
        console.error('[CLEANUP ERROR]:', cleanupErr);
      }
    }
    return { success: false, error: formatErrorMessage(err) };
  }
}

// ============================================================================
// REMOVE CHEMICAL FROM CLIENT
// ============================================================================
export async function removeChemicalFromClientAction(clientId: string, chemicalId: string) {
  const session = await requireAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const adminSupabase = createAdminClient();
  try {
    const { data: updated, error } = await adminSupabase
      .from('client_chemicals')
      .update({ status: 'trashed' })
      .eq('client_id', clientId)
      .eq('chemical_id', chemicalId)
      .eq('status', 'active')
      .select('id');

    if (error) throw error;
    if (!updated?.length) {
      return { success: false, error: 'Substance assignment not found or already removed.' };
    }
    
    await adminSupabase.from('activity_logs').insert({
      client_id: clientId,
      user_id: session.userId,
      action: 'CHEMICAL_TRASHED',
      entity_type: 'client_chemicals',
      entity_id: chemicalId,
      description: `Moved substance to trash`,
    });

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath(`/admin/clients/${clientId}/rc-certificates`);
    revalidatePath(`/admin/clients/${clientId}/chemicals`);
    revalidatePath('/admin/rc-certificates');
    return { success: true, message: 'Substance moved to trash.' };
  } catch (err) {
    return { success: false, error: formatErrorMessage(err) };
  }
}

export async function restoreClientChemicalAction(clientId: string, chemicalId: string) {
  const session = await requireAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const adminSupabase = createAdminClient();
  try {
    const { data: link, error: fetchErr } = await adminSupabase
      .from('client_chemicals')
      .select('id, status')
      .eq('client_id', clientId)
      .eq('chemical_id', chemicalId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!link) return { success: false, error: 'Substance assignment not found.' };
    if (link.status !== 'trashed') {
      return { success: false, error: 'This substance is not in trash.' };
    }

    const { error } = await adminSupabase
      .from('client_chemicals')
      .update({ status: 'active' })
      .eq('id', link.id);

    if (error) throw error;

    await adminSupabase.from('activity_logs').insert({
      client_id: clientId,
      user_id: session.userId,
      action: 'CHEMICAL_RESTORED',
      entity_type: 'client_chemicals',
      entity_id: chemicalId,
      description: 'Restored substance from trash',
    });

    revalidatePath(`/admin/clients/${clientId}`);
    return { success: true, message: 'Substance restored.' };
  } catch (err) {
    return { success: false, error: formatErrorMessage(err) };
  }
}

export async function permanentDeleteClientChemicalAction(clientId: string, chemicalId: string) {
  const session = await requireAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const adminSupabase = createAdminClient();
  try {
    const deletedCertCount = await (
      await import('@/actions/reach')
    ).deleteAllReachCertificatesForClientChemical(
      adminSupabase,
      clientId,
      chemicalId
    );

    const { error } = await adminSupabase
      .from('client_chemicals')
      .delete()
      .eq('client_id', clientId)
      .eq('chemical_id', chemicalId)
      .eq('status', 'trashed');

    if (error) throw error;

    await adminSupabase.from('activity_logs').insert({
      client_id: clientId,
      user_id: session.userId,
      action: 'CHEMICAL_PERMANENTLY_DELETED',
      entity_type: 'client_chemicals',
      entity_id: chemicalId,
      description:
        deletedCertCount > 0
          ? `Permanently removed trashed substance assignment and ${deletedCertCount} RC certificate(s) from database`
          : 'Permanently removed trashed substance assignment',
    });

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath(`/admin/clients/${clientId}/rc-certificates`);
    revalidatePath('/admin/rc-certificates');
    return { success: true, message: 'Substance and related RC certificates permanently deleted.' };
  } catch (err) {
    return { success: false, error: formatErrorMessage(err) };
  }
}

// ============================================================================
// EDIT CLIENT CHEMICAL
// ============================================================================
export async function editClientChemicalAction(clientId: string, chemicalId: string, data: any) {
  const session = await requireAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  if (!data.chemical_name?.trim()) {
    return { success: false, error: 'Substance name is required.' };
  }

  if (!data.ec_number?.trim()) {
    return { success: false, error: 'EC number is required.' };
  }

  const adminSupabase = createAdminClient();
  try {
    const { data: existingLink } = await adminSupabase
      .from('client_chemicals')
      .select('available_quantity')
      .eq('client_id', clientId)
      .eq('chemical_id', chemicalId)
      .maybeSingle();

    const exportedMt = await getClientYearExportedMt(adminSupabase, clientId, chemicalId);
    const bandMax = getTonnageBandMaxQuota(data.tonnage_band);
    let nextQuota = existingLink?.available_quantity;

    if (bandMax != null && bandMax > 0) {
      const { assignable, error: quotaError } = computeAssignableQuota(bandMax, exportedMt);
      if (!quotaError) {
        nextQuota = assignable;
      }
    }

    const chemUpdate: any = {
      chemical_name: data.chemical_name.trim(),
      cas_number: data.cas_number || null,
      ec_number: data.ec_number.trim(),
    };
    if (data.update_global_tonnage_band) {
      chemUpdate.tonnage_band = data.tonnage_band || null;
    }

    const { error: chemError } = await adminSupabase
      .from('chemicals')
      .update(chemUpdate)
      .eq('id', chemicalId);

    if (chemError) throw chemError;

    const clientChemUpdate: {
      validity_date: string | null;
      available_quantity?: number;
      registration_number?: string | null;
      issued_date?: string | null;
    } = {
      validity_date: null,
    };

    if (data.validity_date !== undefined) {
      const validity = normalizeOptionalDateInput(data.validity_date, 'Validity date');
      if (!validity.ok) return { success: false, error: validity.error };
      clientChemUpdate.validity_date = validity.iso;
    }
    if (data.registration_number !== undefined) {
      clientChemUpdate.registration_number = data.registration_number?.trim() || null;
    }
    if (data.issued_date !== undefined) {
      const issued = normalizeOptionalDateInput(data.issued_date, 'Issued date');
      if (!issued.ok) return { success: false, error: issued.error };
      clientChemUpdate.issued_date = issued.iso;
    }
    if (nextQuota !== undefined && nextQuota !== null) {
      clientChemUpdate.available_quantity = nextQuota;
    }

    const { error } = await adminSupabase
      .from('client_chemicals')
      .update(clientChemUpdate)
      .eq('client_id', clientId)
      .eq('chemical_id', chemicalId);

    if (error) throw error;

    await adminSupabase.from('activity_logs').insert({
      client_id: clientId,
      user_id: session.userId,
      action: 'CHEMICAL_EDITED',
      entity_type: 'client_chemicals',
      entity_id: chemicalId,
      description: `Edited substance allocation limits`,
    });

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath(`/admin/clients/${clientId}/chemicals`);
    revalidatePath(`/admin/clients/${clientId}/rc-certificates`);
    return { success: true, message: 'Substance allocation updated.' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

// ============================================================================
// SECONDARY CONTACTS CRUD
// ============================================================================
export async function addContactAction(clientId: string, contact: { first_name: string; last_name: string; email: string; phone?: string; role?: string }) {
  const session = await requireAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const adminSupabase = createAdminClient();
  try {
    const { error } = await adminSupabase.from('client_contacts').insert({ client_id: clientId, ...contact });
    if (error) throw error;
    revalidatePath(`/admin/clients/${clientId}`);
    return { success: true, message: 'Contact added.' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

export async function deleteContactAction(contactId: string, clientId: string) {
  const session = await requireAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const adminSupabase = createAdminClient();
  try {
    const { error } = await adminSupabase.from('client_contacts').delete().eq('id', contactId);
    if (error) throw error;
    revalidatePath(`/admin/clients/${clientId}`);
    return { success: true, message: 'Contact removed.' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

// ============================================================================
// INTERNAL NOTES
// ============================================================================
export async function addInternalNoteAction(clientId: string, note: string) {
  const session = await requireAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const parsed = internalNoteSchema.safeParse({ note });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const adminSupabase = createAdminClient();
  try {
    const { error } = await adminSupabase.from('internal_notes').insert({
      client_id: clientId,
      author_id: session.userId,
      note: parsed.data.note,
    });
    if (error) throw error;
    revalidatePath(`/admin/clients/${clientId}`);
    return { success: true, message: 'Note added.' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

export async function deleteInternalNoteAction(noteId: string, clientId: string) {
  const session = await requireAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const adminSupabase = createAdminClient();
  try {
    const { error } = await adminSupabase.from('internal_notes').delete().eq('id', noteId);
    if (error) throw error;
    revalidatePath(`/admin/clients/${clientId}`);
    return { success: true, message: 'Note deleted.' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

export async function getClientChemicalIdsForEditAction(clientId: string) {
  const session = await requireAdmin();
  if (!session) return { success: false as const, error: 'Unauthorized.', ids: [] as string[] };

  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from('client_chemicals')
    .select('chemical_id')
    .eq('client_id', clientId);

  if (error) return { success: false as const, error: error.message, ids: [] as string[] };
  const ids = ((data as { chemical_id: string }[]) || []).map((row) => row.chemical_id);
  return { success: true as const, ids, error: undefined };
}
