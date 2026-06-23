'use server';

import { createAdminClient } from '@/lib/db/admin';
import { getSession } from '@/lib/auth/session';
import { buildReachCertificateStoredFile } from '@/lib/reach-pdf-data';
import { buildCertificateRecipients } from '@/lib/certificate-email-recipients';
import { appendMailSentHistory } from '@/lib/certificate-mail-history';
import { buildRcSmtpConfig } from '@/lib/certificate-smtp-settings';
import { CERTIFICATES_BUCKET, ensureCertificatesBucket } from '@/lib/storage';
import { resolveReachCertificateDownloadFile } from '@/lib/reach-certificate-pdf';
import { clearReachCertificateStorageFiles } from '@/lib/reach-certificate-storage';
import { revalidatePath } from 'next/cache';
import { notifyUser } from '@/lib/notifications';
import { getTonnageBandMaxQuota } from '@/lib/quota';
import { sendBulkReachCertificatesEmail, sendCertificateEmail as sendCertEmail } from '@/services/email';
import {
  REACH_CERTIFICATE_TYPE,
  findReachCertificatePeriodConflict,
  findReachCertificateYearConflict,
  findExactReachCertForPeriod,
  getReachCertificateYear,
  isReachCertificateType,
  getLastDateOfYear,
  getTodayDateString,
} from '@/lib/reach-certificate';
import { normalizeDateInput } from '@/lib/parse-flexible-date';
import {
  clientHasEuReachRegistration,
  EU_REACH_CERTIFICATE_REQUIRED_MESSAGE,
} from '@/lib/regulatory-registrations';

function normalizeReachCertificateDates(
  issuedDate: string,
  validatedDate: string
): { ok: true; issuedDate: string; validatedDate: string } | { ok: false; error: string } {
  const issued = normalizeDateInput(issuedDate, 'Issued date');
  if (!issued.ok) return issued;

  const validated = normalizeDateInput(validatedDate, 'Validated date');
  if (!validated.ok) return validated;

  if (validated.iso < issued.iso) {
    return { ok: false, error: 'Validated date cannot be before issued date.' };
  }

  return { ok: true, issuedDate: issued.iso, validatedDate: validated.iso };
}

async function requireAdmin() {
  const session = await getSession();
  if (!session || (session.role !== 'MASTER_ADMIN' && session.role !== 'SUPER_ADMIN')) {
    return null;
  }
  return session;
}

export type CreateReachCertificateInput = {
  clientId: string;
  chemicalId: string;
  userId: string;
  registrationNumber: string;
  issuedDate: string;
  validatedDate: string;
  allocatedQuantity?: number | null;
  tonnageBand?: string | null;
};

export async function createReachCertificate(input: CreateReachCertificateInput) {
  const {
    clientId,
    chemicalId,
    userId,
    registrationNumber,
    allocatedQuantity,
    tonnageBand,
  } = input;
  const adminSupabase = createAdminClient();

  if (!registrationNumber.trim()) {
    return { success: false as const, error: 'Registration number is required.' };
  }

  const dates = normalizeReachCertificateDates(input.issuedDate, input.validatedDate);
  if (!dates.ok) {
    return { success: false as const, error: dates.error };
  }
  const issuedDate = dates.issuedDate;
  const validatedDate = dates.validatedDate;

  const [{ data: client }, { data: clientChem }, { data: chemical }] = await Promise.all([
    adminSupabase
      .from('clients')
      .select(
        'id, company_name, email, uuid_number, address, city, state, postal_code, country, regulatory_registrations'
      )
      .eq('id', clientId)
      .single(),
    adminSupabase
      .from('client_chemicals')
      .select('id, status')
      .eq('client_id', clientId)
      .eq('chemical_id', chemicalId)
      .eq('status', 'active')
      .maybeSingle(),
    adminSupabase
      .from('chemicals')
      .select('id, chemical_name, cas_number, ec_number, tonnage_band')
      .eq('id', chemicalId)
      .single(),
  ]);

  if (!client) return { success: false as const, error: 'Client not found.' };
  if (!clientHasEuReachRegistration(client.regulatory_registrations)) {
    return { success: false as const, error: EU_REACH_CERTIFICATE_REQUIRED_MESSAGE };
  }
  if (!clientChem) {
    return {
      success: false as const,
      error: 'This substance is not actively assigned to the client. Assign it first.',
    };
  }
  if (!chemical) return { success: false as const, error: 'Substance not found.' };

  const { data: existingReachCertsRaw } = await adminSupabase
    .from('certificates')
    .select('id, issued_at, expires_at, status, certificate_number, type, chemical_id, registration_number, tonnage_band, allocated_quantity, chemicals(cas_number)')
    .eq('client_id', clientId)
    .neq('status', 'revoked');

  const existingReachCerts = (existingReachCertsRaw || []).filter(isReachCertificateType);
  const periodConflict = findReachCertificatePeriodConflict(
    existingReachCerts,
    chemicalId,
    chemical.chemical_name,
    issuedDate,
    validatedDate,
    undefined,
    chemical.cas_number,
    registrationNumber
  );
  if (periodConflict) {
    const existingExact = findExactReachCertForPeriod(
      existingReachCerts,
      chemicalId,
      issuedDate,
      validatedDate,
      chemical.cas_number,
      registrationNumber,
      chemical.chemical_name
    );
    if (existingExact && periodConflict.includes('already uses issue date')) {
      if (existingExact.chemical_id !== chemicalId) {
        await adminSupabase
          .from('certificates')
          .update({ chemical_id: chemicalId })
          .eq('id', existingExact.id);
      }

      await adminSupabase
          .from('client_chemicals')
          .update({
            registration_number: registrationNumber.trim(),
            issued_date: issuedDate,
            validity_date: validatedDate,
            certificate_number: existingExact.certificate_number,
          })
          .eq('client_id', clientId)
          .eq('chemical_id', chemicalId);

      revalidatePath(`/admin/clients/${clientId}`);
      revalidatePath(`/admin/clients/${clientId}/chemicals`);

      return {
        success: true as const,
        message: `RC Certificate ${existingExact.certificate_number} is already issued for ${chemical.chemical_name}. Record linked.`,
        certificateId: existingExact.id,
        certNumber: existingExact.certificate_number,
      };
    }
    return { success: false as const, error: periodConflict };
  }

  const certYear = getReachCertificateYear(issuedDate);
  if (certYear != null) {
    const yearConflict = findReachCertificateYearConflict(
      existingReachCerts,
      chemicalId,
      certYear,
      chemical.chemical_name,
      chemical.cas_number,
      registrationNumber
    );
    if (yearConflict) {
      return { success: false as const, error: yearConflict };
    }
  }

  const issueDate = new Date(`${issuedDate}T12:00:00`);
  const expiryDate = new Date(`${validatedDate}T12:00:00`);
  const randStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const certNumber = `RC-${issueDate.getFullYear()}-${randStr}`;
  const certFile = await buildReachCertificateStoredFile(client, chemical, certNumber, {
    registrationNumber: registrationNumber.trim(),
    issuedDate,
    validatedDate,
    tonnageBand: tonnageBand || chemical.tonnage_band,
    clientId,
    chemicalId,
  });

  await ensureCertificatesBucket(adminSupabase);
  const { error: uploadError } = await adminSupabase.storage
    .from(CERTIFICATES_BUCKET)
    .upload(certFile.fileName, certFile.buffer, {
      contentType: certFile.contentType,
      upsert: true,
    });

  if (uploadError) throw new Error(`PDF upload failed: ${uploadError.message}`);

  const {
    data: { publicUrl },
  } = adminSupabase.storage.from(CERTIFICATES_BUCKET).getPublicUrl(certFile.fileName);

  const coreInsert = {
    client_id: clientId,
    chemical_id: chemicalId,
    certificate_number: certNumber,
    registration_number: registrationNumber.trim(),
    type: REACH_CERTIFICATE_TYPE,
    file_url: publicUrl,
    issued_at: issueDate.toISOString(),
    expires_at: expiryDate.toISOString(),
    status: 'active',
    mail_sent: false,
    mail_resend_count: 0,
  };

  const insertCandidates = [
    {
      ...coreInsert,
      ...(allocatedQuantity != null && Number(allocatedQuantity) > 0
        ? { allocated_quantity: Number(allocatedQuantity) }
        : {}),
      ...(tonnageBand ? { tonnage_band: tonnageBand } : {}),
      created_by: userId,
    },
    coreInsert,
  ];

  let cert: { id: string } | null = null;
  let lastInsertError: { message?: string } | null = null;

  for (const row of insertCandidates) {
    const { data, error: certError } = await adminSupabase
      .from('certificates')
      .insert(row)
      .select()
      .single();

    if (!certError && data) {
      cert = data;
      break;
    }
    lastInsertError = certError;
    const message = certError?.message?.toLowerCase() ?? '';
    const missingOptionalColumn =
      message.includes('column') &&
      (message.includes('allocated_quantity') ||
        message.includes('tonnage_band') ||
        message.includes('created_by') ||
        message.includes('updated_by') ||
        message.includes('updated_at'));
    if (!missingOptionalColumn) {
      throw certError;
    }
  }

  if (!cert) {
    throw new Error(lastInsertError?.message || 'Failed to create RC certificate record.');
  }

  await adminSupabase
    .from('client_chemicals')
    .update({
      registration_number: registrationNumber.trim(),
      issued_date: issuedDate,
      validity_date: validatedDate,
      certificate_number: certNumber,
    })
    .eq('client_id', clientId)
    .eq('chemical_id', chemicalId);

  await adminSupabase.from('activity_logs').insert({
    client_id: clientId,
    user_id: userId,
    action: 'REACH_CERTIFICATE_ISSUED',
    entity_type: 'certificates',
    entity_id: cert.id,
    description: `RC Certificate ${certNumber} issued for ${chemical.chemical_name}`,
  });

  const { data: clientUser } = await adminSupabase
    .from('users')
    .select('id')
    .eq('client_id', clientId)
    .maybeSingle();

  if (clientUser) {
    await notifyUser(
      adminSupabase,
      clientUser.id,
      'RC Compliance Certificate Issued',
      `Your RC certificate ${certNumber} for ${chemical.chemical_name} is valid until ${expiryDate.toLocaleDateString()}. You may now apply for TCC permits for this substance.`,
      '/client'
    );
  }

  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath(`/admin/clients/${clientId}/chemicals`);
  revalidatePath(`/admin/clients/${clientId}/rc-certificates`);
  revalidatePath('/client');

  return {
    success: true as const,
    message: `RC Certificate issued for ${chemical.chemical_name}.`,
    certificateId: cert.id,
    certNumber,
  };
}

export async function regenerateReachCertificateFile(certId: string) {
  const adminSupabase = createAdminClient();

  const { data: cert } = await adminSupabase
    .from('certificates')
    .select(
      'id, certificate_number, registration_number, tonnage_band, issued_at, expires_at, client_id, chemical_id, type'
    )
    .eq('id', certId)
    .eq('type', REACH_CERTIFICATE_TYPE)
    .single();

  if (!cert?.client_id || !cert.chemical_id) return { success: false as const, error: 'Certificate not found.' };

  const [{ data: client }, { data: chemical }] = await Promise.all([
    adminSupabase
      .from('clients')
      .select('id, company_name, uuid_number, address, city, state, postal_code, country')
      .eq('id', cert.client_id)
      .single(),
    adminSupabase
      .from('chemicals')
      .select('id, chemical_name, cas_number, ec_number, tonnage_band')
      .eq('id', cert.chemical_id)
      .single(),
  ]);

  if (!client || !chemical || !cert.registration_number) {
    return { success: false as const, error: 'Missing certificate data for regeneration.' };
  }

  const certNumber = cert.certificate_number;

  try {
    await clearReachCertificateStorageFiles(adminSupabase, certNumber);

    const certFile = await buildReachCertificateStoredFile(client, chemical, certNumber, {
      registrationNumber: cert.registration_number,
      issuedDate: cert.issued_at.split('T')[0],
      validatedDate: cert.expires_at?.split('T')[0] || getLastDateOfYear(),
      tonnageBand: cert.tonnage_band,
      clientId: cert.client_id,
      chemicalId: cert.chemical_id,
    });

    await ensureCertificatesBucket(adminSupabase);
    const { error: uploadError } = await adminSupabase.storage
      .from(CERTIFICATES_BUCKET)
      .upload(certFile.fileName, certFile.buffer, {
        contentType: certFile.contentType,
        upsert: true,
      });

    if (uploadError) return { success: false as const, error: uploadError.message };

    const {
      data: { publicUrl },
    } = adminSupabase.storage.from(CERTIFICATES_BUCKET).getPublicUrl(certFile.fileName);

    await adminSupabase.from('certificates').update({ file_url: publicUrl }).eq('id', certId);

    return { success: true as const, fileUrl: publicUrl };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Certificate file regeneration failed.';
    console.warn(`[RC] regenerateReachCertificateFile(${certId}):`, message);
    return { success: false as const, error: message };
  }
}

export async function issueReachCertificateFromPreviewAction(
  clientId: string,
  chemicalId: string,
  data: { registrationNumber: string; issuedDate: string; validatedDate: string; tonnageBand?: string | null }
) {
  const session = await requireAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  try {
    const adminSupabase = createAdminClient();
    const { data: chemical } = await adminSupabase
      .from('chemicals')
      .select('tonnage_band')
      .eq('id', chemicalId)
      .maybeSingle();

    const resolvedTonnageBand = data.tonnageBand !== undefined ? data.tonnageBand : (chemical?.tonnage_band || null);

    const bandMax = resolvedTonnageBand
      ? getTonnageBandMaxQuota(resolvedTonnageBand)
      : null;

    const result = await createReachCertificate({
      clientId,
      chemicalId,
      userId: session.userId,
      registrationNumber: data.registrationNumber,
      issuedDate: data.issuedDate,
      validatedDate: data.validatedDate,
      allocatedQuantity: bandMax,
      tonnageBand: resolvedTonnageBand,
    });

    if (!result.success) return result;
    return {
      success: true,
      message: result.message,
      certificateId: result.certificateId,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

// ============================================================================
// RENEW RC CERTIFICATE (Admin — new period + quota from substance table)
// ============================================================================
export async function renewReachCertificateAction(
  clientId: string,
  chemicalId: string,
  data: {
    issuedDate: string;
    validatedDate: string;
    available_quantity: number;
    registrationNumber?: string;
    tonnageBand?: string | null;
  }
) {
  const session = await requireAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const dates = normalizeReachCertificateDates(data.issuedDate, data.validatedDate);
  if (!dates.ok) return { success: false, error: dates.error };

  if (!data.available_quantity || data.available_quantity <= 0) {
    return { success: false, error: 'Quota must be greater than 0 MT.' };
  }

  const adminSupabase = createAdminClient();
  let registrationNumber = data.registrationNumber?.trim() || '';
  let prevTonnageBand: string | null = null;

  if (!registrationNumber || !data.tonnageBand) {
    const { data: prevCert } = await adminSupabase
      .from('certificates')
      .select('registration_number, tonnage_band')
      .eq('client_id', clientId)
      .eq('chemical_id', chemicalId)
      .eq('type', REACH_CERTIFICATE_TYPE)
      .order('issued_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!registrationNumber) {
      registrationNumber = prevCert?.registration_number?.trim() || '';
    }
    prevTonnageBand = prevCert?.tonnage_band || null;
  }

  if (!registrationNumber) {
    return {
      success: false,
      error: 'Registration number is required. Enter it in the renewal form.',
    };
  }

  try {
    const result = await createReachCertificate({
      clientId,
      chemicalId,
      userId: session.userId,
      registrationNumber,
      issuedDate: dates.issuedDate,
      validatedDate: dates.validatedDate,
      allocatedQuantity: data.available_quantity,
      tonnageBand: data.tonnageBand || prevTonnageBand,
    });

    if (!result.success) return result;

    const { error: ccError } = await adminSupabase
      .from('client_chemicals')
      .update({
        available_quantity: data.available_quantity,
        validity_date: dates.validatedDate,
        certificate_number: result.certNumber,
        status: 'active',
      })
      .eq('client_id', clientId)
      .eq('chemical_id', chemicalId);

    if (ccError) throw ccError;

    await adminSupabase.from('quota_transactions').insert({
      client_id: clientId,
      chemical_id: chemicalId,
      quantity_mt: data.available_quantity,
      transaction_type: 'assign',
      performed_by: session.userId,
      notes: `RC renewed — quota set to ${data.available_quantity} MT`,
    });

    await adminSupabase.from('activity_logs').insert({
      client_id: clientId,
      user_id: session.userId,
      action: 'REACH_CERTIFICATE_RENEWED',
      entity_type: 'certificates',
      entity_id: result.certificateId,
      description: `RC renewed with ${data.available_quantity} MT quota until ${dates.validatedDate}`,
    });

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath(`/admin/clients/${clientId}/rc-certificates`);
    revalidatePath('/client');

    return {
      success: true,
      message: result.message || 'RC Certificate renewed successfully.',
      certificateId: result.certificateId,
      certificateNumber: result.certNumber,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

// ============================================================================
// UPDATE RC CERTIFICATE (Admin — edit issued certificate metadata)
// ============================================================================
export async function updateReachCertificateAction(
  certId: string,
  data: {
    registrationNumber: string;
    issuedDate: string;
    validatedDate: string;
    allocatedQuantity?: number | null;
    tonnageBand?: string | null;
  }
) {
  const session = await requireAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const registrationNumber = data.registrationNumber?.trim();
  if (!registrationNumber) return { success: false, error: 'Registration number is required.' };

  const dates = normalizeReachCertificateDates(data.issuedDate, data.validatedDate);
  if (!dates.ok) return { success: false, error: dates.error };

  const adminSupabase = createAdminClient();
  const { data: cert } = await adminSupabase
    .from('certificates')
    .select('id, client_id, chemical_id, certificate_number, tonnage_band, type, chemicals(chemical_name, cas_number)')
    .eq('id', certId)
    .single();

  if (!cert?.client_id || !cert.chemical_id || !isReachCertificateType(cert)) {
    return { success: false, error: 'Certificate not found.' };
  }

  const chemicalName =
    (cert.chemicals as { chemical_name?: string } | null)?.chemical_name || 'this substance';
  const casNumber = (cert.chemicals as { cas_number?: string | null } | null)?.cas_number;

  const { data: siblingCertsRaw } = await adminSupabase
    .from('certificates')
    .select('id, issued_at, expires_at, status, certificate_number, type, chemical_id, registration_number, tonnage_band, allocated_quantity, chemicals(cas_number)')
    .eq('client_id', cert.client_id)
    .neq('status', 'revoked');

  const siblingCerts = (siblingCertsRaw || []).filter(isReachCertificateType);
  const periodConflict = findReachCertificatePeriodConflict(
    siblingCerts,
    cert.chemical_id,
    chemicalName,
    dates.issuedDate,
    dates.validatedDate,
    certId,
    casNumber,
    registrationNumber
  );
  if (periodConflict) {
    return { success: false, error: periodConflict };
  }

  const certYear = getReachCertificateYear(dates.issuedDate);
  if (certYear != null) {
    const yearConflict = findReachCertificateYearConflict(
      siblingCerts,
      cert.chemical_id,
      certYear,
      chemicalName,
      casNumber,
      registrationNumber,
      certId
    );
    if (yearConflict) {
      return { success: false, error: yearConflict };
    }
  }

  try {
    const issueDate = new Date(`${dates.issuedDate}T12:00:00`);
    const expiryDate = new Date(`${dates.validatedDate}T12:00:00`);

    const { error: updateError } = await adminSupabase
      .from('certificates')
      .update({
        registration_number: registrationNumber,
        issued_at: issueDate.toISOString(),
        expires_at: expiryDate.toISOString(),
        allocated_quantity:
          data.allocatedQuantity != null && Number(data.allocatedQuantity) > 0
            ? Number(data.allocatedQuantity)
            : null,
        tonnage_band: data.tonnageBand || null,
        updated_by: session.userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', certId);

    if (updateError) throw updateError;

    const { data: latestCert } = await adminSupabase
      .from('certificates')
      .select('id')
      .eq('client_id', cert.client_id)
      .eq('chemical_id', cert.chemical_id)
      .eq('type', REACH_CERTIFICATE_TYPE)
      .order('issued_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestCert?.id === certId) {
      await adminSupabase
        .from('client_chemicals')
        .update({
          validity_date: dates.validatedDate,
          registration_number: registrationNumber,
          issued_date: dates.issuedDate,
          certificate_number: cert.certificate_number,
        })
        .eq('client_id', cert.client_id)
        .eq('chemical_id', cert.chemical_id);
    }

    const regen = await regenerateReachCertificateFile(certId);

    await adminSupabase.from('activity_logs').insert({
      client_id: cert.client_id,
      user_id: session.userId,
      action: 'REACH_CERTIFICATE_UPDATED',
      entity_type: 'certificates',
      entity_id: certId,
      description: `RC ${cert.certificate_number} details updated`,
    });

    revalidatePath(`/admin/clients/${cert.client_id}`);
    revalidatePath(`/admin/clients/${cert.client_id}/chemicals`);
    revalidatePath(`/admin/clients/${cert.client_id}/rc-certificates`);
    revalidatePath(`/admin/clients/${cert.client_id}/rc-preview/${cert.chemical_id}`);

    if (!regen.success) {
      return {
        success: true,
        message: `RC Certificate ${cert.certificate_number} updated. PDF could not be regenerated: ${regen.error}`,
      };
    }

    return {
      success: true,
      message: `RC Certificate ${cert.certificate_number} updated successfully.`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

// ============================================================================
// ISSUE RC CERTIFICATE WITH EXPLICIT DETAILS (assign/import/edit flow)
// ============================================================================
export async function issueReachCertificateWithDetailsAction(
  clientId: string,
  chemicalId: string,
  input: {
    registrationNumber: string;
    issuedDate: string;
    validatedDate: string;
    tonnageBand?: string | null;
    allocatedQuantity?: number | null;
  }
) {
  const session = await requireAdmin();
  if (!session) return { success: false as const, error: 'Unauthorized.' };

  try {
    const bandMax = getTonnageBandMaxQuota(input.tonnageBand);
    const allocated =
      input.allocatedQuantity != null && input.allocatedQuantity > 0
        ? input.allocatedQuantity
        : (bandMax ?? 0);

    const result = await createReachCertificate({
      clientId,
      chemicalId,
      userId: session.userId,
      registrationNumber: input.registrationNumber.trim(),
      issuedDate: input.issuedDate,
      validatedDate: input.validatedDate,
      allocatedQuantity: allocated,
      tonnageBand: input.tonnageBand || null,
    });

    if (!result.success) return result;

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath(`/admin/clients/${clientId}/rc-certificates`);
    revalidatePath('/admin/rc-certificates');

    return {
      success: true as const,
      message: result.message || 'RC Certificate issued.',
      certificateId: result.certificateId,
      certNumber: result.certNumber,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false as const, error: message };
  }
}

async function fetchReachCertificateMailContext(certificateId: string) {
  const adminSupabase = createAdminClient();

  const [{ data: cert, error }, { data: settings }] = await Promise.all([
    adminSupabase
      .from('certificates')
      .select(`
        *,
        chemicals (id, chemical_name, cas_number, ec_number, tonnage_band),
        clients (
          id,
          company_name,
          email,
          uuid_number,
          address,
          city,
          state,
          postal_code,
          country,
          client_contacts (email)
        )
      `)
      .eq('id', certificateId)
      .eq('type', REACH_CERTIFICATE_TYPE)
      .single(),
    adminSupabase
      .from('admin_settings')
      .select(
        'rc_smtp_host, rc_smtp_port, rc_smtp_user, rc_smtp_pass, rc_smtp_from, rc_smtp_cc_default'
      )
      .eq('id', 1)
      .single(),
  ]);

  if (error || !cert) throw new Error('REACH certificate not found.');
  if (!cert.clients?.email) throw new Error('Client primary email is not configured.');

  const contactEmails =
    cert.clients.client_contacts?.map((c: { email: string }) => c.email).filter(Boolean) || [];

  const recipients = buildCertificateRecipients({
    primaryEmail: cert.clients.email,
    contactEmails,
    defaultCcEmails: settings?.rc_smtp_cc_default,
    senderEmail: settings?.rc_smtp_from,
  });

  const attachment = await downloadReachCertificateAttachment(adminSupabase, cert);

  return {
    cert,
    smtpConfig: buildRcSmtpConfig(settings),
    recipients,
    attachment,
    chemicalName: cert.chemicals?.chemical_name || 'N/A',
  };
}

async function downloadReachCertificateAttachment(
  adminSupabase: ReturnType<typeof createAdminClient>,
  cert: {
    id: string;
    certificate_number: string;
    registration_number: string | null;
    issued_at: string;
    expires_at: string | null;
    tonnage_band?: string | null;
    clients: {
      company_name: string;
      uuid_number?: string | null;
      address?: string | null;
      city?: string | null;
      state?: string | null;
      postal_code?: string | null;
      country?: string | null;
    };
    chemicals: {
      chemical_name: string;
      cas_number: string;
      ec_number?: string | null;
      tonnage_band?: string | null;
    };
  }
) {
  const issuedDate = cert.issued_at ? cert.issued_at.split('T')[0] : getTodayDateString();
  const validatedDate = cert.expires_at
    ? cert.expires_at.split('T')[0]
    : getLastDateOfYear();

  const certFile = await resolveReachCertificateDownloadFile(adminSupabase, {
    certificateId: cert.id,
    certificateNumber: cert.certificate_number,
    registrationNumber: cert.registration_number?.trim() || '—',
    issuedDate,
    validatedDate,
    client: cert.clients,
    chemical: cert.chemicals,
    tonnageBand: cert.tonnage_band,
  });

  return {
    buffer: certFile.buffer,
    fileName: certFile.fileName,
    contentType: certFile.contentType,
  };
}

export async function sendReachCertificateEmailAction(certificateId: string) {
  const session = await requireAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const adminSupabase = createAdminClient();

  try {
    const { cert, smtpConfig, recipients, attachment, chemicalName } =
      await fetchReachCertificateMailContext(certificateId);

    await sendCertEmail({
      to: recipients.to,
      cc: recipients.cc,
      subject: `REACH Compliance Certificate Issued — ${cert.certificate_number}`,
      certificateNumber: cert.certificate_number,
      companyName: cert.clients.company_name,
      chemicalName,
      pdfBuffer: attachment.buffer,
      pdfFileName: attachment.fileName,
      attachmentContentType: attachment.contentType,
      smtpConfig,
      certificateType: 'REACH',
    });

    const now = new Date().toISOString();
    await adminSupabase
      .from('certificates')
      .update({
        mail_sent: true,
        mail_sent_at: now,
        mail_sent_by: session.userId,
        mail_sent_history: [now],
      })
      .eq('id', certificateId);

    await adminSupabase.from('activity_logs').insert({
      client_id: cert.client_id,
      user_id: session.userId,
      action: 'REACH_CERTIFICATE_EMAIL_SENT',
      entity_type: 'certificates',
      entity_id: certificateId,
      description: `RC certificate email sent to ${recipients.to}`,
    });

    revalidatePath(`/admin/clients/${cert.client_id}/rc-certificates`);
    revalidatePath(`/admin/clients/${cert.client_id}/rc-preview/${cert.chemical_id}`);

    return {
      success: true,
      message: `Certificate email sent to ${recipients.to}`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[SEND REACH CERT EMAIL ERROR]:', err);
    return { success: false, error: message };
  }
}

export async function resendReachCertificateEmailAction(certificateId: string) {
  const session = await requireAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const adminSupabase = createAdminClient();

  try {
    const { cert, smtpConfig, recipients, attachment, chemicalName } =
      await fetchReachCertificateMailContext(certificateId);

    if (!cert.mail_sent) {
      return { success: false, error: 'Certificate has not been sent yet. Use Send Mail first.' };
    }

    await sendCertEmail({
      to: recipients.to,
      cc: recipients.cc,
      subject: `REACH Compliance Certificate (Resent) — ${cert.certificate_number}`,
      certificateNumber: cert.certificate_number,
      companyName: cert.clients.company_name,
      chemicalName,
      pdfBuffer: attachment.buffer,
      pdfFileName: attachment.fileName,
      attachmentContentType: attachment.contentType,
      smtpConfig,
      certificateType: 'REACH',
    });

    const now = new Date().toISOString();
    await adminSupabase
      .from('certificates')
      .update({
        mail_resend_count: (cert.mail_resend_count || 0) + 1,
        last_resend_at: now,
        last_resend_by: session.userId,
        mail_sent_history: appendMailSentHistory(cert.mail_sent_history, now),
      })
      .eq('id', certificateId);

    await adminSupabase.from('activity_logs').insert({
      client_id: cert.client_id,
      user_id: session.userId,
      action: 'REACH_CERTIFICATE_EMAIL_RESENT',
      entity_type: 'certificates',
      entity_id: certificateId,
      description: `RC certificate email resent (${(cert.mail_resend_count || 0) + 1}x)`,
    });

    revalidatePath(`/admin/clients/${cert.client_id}/rc-certificates`);
    revalidatePath(`/admin/clients/${cert.client_id}/rc-preview/${cert.chemical_id}`);

    return { success: true, message: 'Certificate email resent successfully.' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

export async function sendBulkReachCertificatesEmailAction(
  clientId: string,
  certificateIds: string[]
) {
  const session = await requireAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const uniqueIds = [...new Set(certificateIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { success: false, error: 'Select at least one RC certificate.' };
  }

  const adminSupabase = createAdminClient();

  try {
    const [{ data: certs, error }, { data: settings }] = await Promise.all([
      adminSupabase
        .from('certificates')
        .select(`
          *,
          chemicals (id, chemical_name, cas_number, ec_number, tonnage_band),
          clients (
            id,
            company_name,
            email,
            uuid_number,
            address,
            city,
            state,
            postal_code,
            country,
            client_contacts (email)
          )
        `)
        .in('id', uniqueIds)
        .eq('client_id', clientId)
        .eq('type', REACH_CERTIFICATE_TYPE),
      adminSupabase
        .from('admin_settings')
        .select(
          'rc_smtp_host, rc_smtp_port, rc_smtp_user, rc_smtp_pass, rc_smtp_from, rc_smtp_cc_default'
        )
        .eq('id', 1)
        .single(),
    ]);

    if (error || !certs?.length) {
      throw new Error('Selected RC certificates were not found.');
    }
    if (certs.length !== uniqueIds.length) {
      throw new Error('Some selected RC certificates could not be found.');
    }

    const client = certs[0].clients;
    if (!client?.email) {
      throw new Error('Client primary email is not configured.');
    }

    const contactEmails =
      client.client_contacts?.map((c: { email: string }) => c.email).filter(Boolean) || [];

    const recipients = buildCertificateRecipients({
      primaryEmail: client.email,
      contactEmails,
      defaultCcEmails: settings?.rc_smtp_cc_default,
      senderEmail: settings?.rc_smtp_from,
    });

    const attachmentItems = await Promise.all(
      certs.map(async (cert: any) => {
        const attachment = await downloadReachCertificateAttachment(adminSupabase, cert);
        return {
          certificateNumber: cert.certificate_number,
          chemicalName: cert.chemicals?.chemical_name || 'N/A',
          pdfBuffer: attachment.buffer,
          pdfFileName: attachment.fileName,
          attachmentContentType: attachment.contentType,
        };
      })
    );

    const subject =
      certs.length === 1
        ? `REACH Compliance Certificate Issued — ${certs[0].certificate_number}`
        : `REACH Compliance Certificates Issued — ${certs.length} Certificates`;

    await sendBulkReachCertificatesEmail({
      to: recipients.to,
      cc: recipients.cc,
      subject,
      companyName: client.company_name,
      items: attachmentItems,
      smtpConfig: buildRcSmtpConfig(settings),
    });

    const now = new Date().toISOString();
    for (const cert of certs) {
      const alreadySent = Boolean(cert.mail_sent);
      await adminSupabase
        .from('certificates')
        .update(
          alreadySent
            ? {
                mail_resend_count: (cert.mail_resend_count || 0) + 1,
                last_resend_at: now,
                last_resend_by: session.userId,
                mail_sent_history: appendMailSentHistory(cert.mail_sent_history, now),
              }
            : {
                mail_sent: true,
                mail_sent_at: now,
                mail_sent_by: session.userId,
                mail_sent_history: [now],
              }
        )
        .eq('id', cert.id);

      await adminSupabase.from('activity_logs').insert({
        client_id: clientId,
        user_id: session.userId,
        action: alreadySent ? 'REACH_CERTIFICATE_EMAIL_RESENT' : 'REACH_CERTIFICATE_EMAIL_SENT',
        entity_type: 'certificates',
        entity_id: cert.id,
        description: alreadySent
          ? `RC certificate email resent via bulk send (${(cert.mail_resend_count || 0) + 1}x)`
          : `RC certificate email sent via bulk send to ${recipients.to}`,
      });

      if (cert.chemical_id) {
        revalidatePath(`/admin/clients/${clientId}/rc-preview/${cert.chemical_id}`);
      }
    }

    revalidatePath(`/admin/clients/${clientId}/rc-certificates`);

    return {
      success: true,
      message: `${certs.length} RC certificate${certs.length > 1 ? 's' : ''} sent to ${recipients.to} in one email.`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[SEND BULK REACH CERT EMAIL ERROR]:', err);
    return { success: false, error: message };
  }
}

async function syncClientChemicalReachFields(
  adminSupabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  chemicalId: string
) {
  const { data: remainingRaw } = await adminSupabase
    .from('certificates')
    .select('id, certificate_number, registration_number, issued_at, expires_at, type, status')
    .eq('client_id', clientId)
    .eq('chemical_id', chemicalId)
    .neq('status', 'revoked')
    .order('issued_at', { ascending: false });

  const latest = (remainingRaw || []).filter(isReachCertificateType)[0] ?? null;
  const toDateOnly = (value: string | null | undefined) =>
    value ? value.split('T')[0] : null;

  if (!latest) {
    const { error } = await adminSupabase
      .from('client_chemicals')
      .delete()
      .eq('client_id', clientId)
      .eq('chemical_id', chemicalId);

    if (error) throw error;
  } else {
    const { error } = await adminSupabase
      .from('client_chemicals')
      .update({
        certificate_number: latest.certificate_number?.trim() || null,
        registration_number: latest.registration_number?.trim() || null,
        issued_date: toDateOnly(latest.issued_at),
        validity_date: toDateOnly(latest.expires_at),
      })
      .eq('client_id', clientId)
      .eq('chemical_id', chemicalId);

    if (error) throw error;
  }
}

export async function deleteAllReachCertificatesForClientChemical(
  adminSupabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  chemicalId: string
) {
  const { data: certs, error: fetchError } = await adminSupabase
    .from('certificates')
    .select('id, certificate_number, type')
    .eq('client_id', clientId)
    .eq('chemical_id', chemicalId);

  if (fetchError) throw fetchError;

  const rcCerts = (certs || []).filter(isReachCertificateType);
  if (rcCerts.length === 0) return 0;

  const storageFiles = rcCerts.flatMap((cert: any) => [
    `${cert.certificate_number}.pdf`,
    `${cert.certificate_number}.docx`,
  ]);
  await adminSupabase.storage.from(CERTIFICATES_BUCKET).remove(storageFiles);

  const { error: deleteError } = await adminSupabase
    .from('certificates')
    .delete()
    .in(
      'id',
      rcCerts.map((cert: any) => cert.id)
    );

  if (deleteError) throw deleteError;
  return rcCerts.length;
}

export async function deleteReachCertificateAction(certificateId: string, clientId: string) {
  const session = await requireAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const adminSupabase = createAdminClient();

  try {
    const { data: cert, error } = await adminSupabase
      .from('certificates')
      .select('id, certificate_number, chemical_id, client_id, type, status, chemicals(chemical_name)')
      .eq('id', certificateId)
      .eq('client_id', clientId)
      .single();

    if (error || !cert || !isReachCertificateType(cert)) {
      return { success: false, error: 'RC certificate not found.' };
    }

    const storageFiles = [`${cert.certificate_number}.pdf`, `${cert.certificate_number}.docx`];
    await adminSupabase.storage.from(CERTIFICATES_BUCKET).remove(storageFiles);

    const { data: deleted, error: deleteError } = await adminSupabase
      .from('certificates')
      .delete()
      .eq('id', certificateId)
      .select('id')
      .maybeSingle();

    if (deleteError) throw deleteError;
    if (!deleted) {
      return { success: false, error: 'Failed to delete RC certificate from database.' };
    }

    if (cert.chemical_id) {
      await syncClientChemicalReachFields(adminSupabase, clientId, cert.chemical_id);
    }

    const chemicalName =
      (cert.chemicals as { chemical_name?: string } | null)?.chemical_name || 'Unknown';

    await adminSupabase.from('activity_logs').insert({
      client_id: clientId,
      user_id: session.userId,
      action: 'REACH_CERTIFICATE_DELETED',
      entity_type: 'certificates',
      entity_id: certificateId,
      description: `RC Certificate ${cert.certificate_number} permanently deleted for ${chemicalName}`,
    });

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath(`/admin/clients/${clientId}/rc-certificates`);
    revalidatePath(`/admin/clients/${clientId}/chemicals`);
    revalidatePath('/admin/rc-certificates');
    revalidatePath('/client');

    return {
      success: true,
      message: `RC Certificate ${cert.certificate_number} permanently deleted.`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
