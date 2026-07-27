import { createAdminClient } from '@/lib/db/admin';
import { buildReachCertificateStoredFile } from '@/lib/reach-pdf-data';
import { resolveCertificateStorageRelativePath } from '@/lib/storage-paths';
import { resolveClientStorageFolder } from '@/lib/client-storage-folder';
import { CERTIFICATES_BUCKET, ensureCertificatesBucket } from '@/lib/storage';
import { clearReachCertificateStorageFiles } from '@/lib/reach-certificate-storage';
import { revalidatePath } from 'next/cache';
import { notifyUser } from '@/lib/notifications';
import {
  REACH_CERTIFICATE_TYPE,
  findReachCertificatePeriodConflict,
  findReachCertificateYearConflict,
  findExactReachCertForPeriod,
  getReachCertificateYear,
  isReachCertificateType,
  getLastDateOfYear,
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

/** Internal CT certificate create/regenerate — NOT a Next.js server action. */
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
      .select('id, chemical_name, cas_number, ec_number, tonnage_band, is_intermediate_substance')
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
        message: `CT Certificate ${existingExact.certificate_number} is already issued for ${chemical.chemical_name}. Record linked.`,
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
  const clientFolder = await resolveClientStorageFolder(
    adminSupabase,
    clientId,
    client.company_name || 'client'
  );
  const storagePath = resolveCertificateStorageRelativePath({
    folder: 'RC',
    clientFolder,
    date: issuedDate,
    fileName: certFile.fileName,
  });

  await ensureCertificatesBucket(adminSupabase);
  const { error: uploadError } = await adminSupabase.storage
    .from(CERTIFICATES_BUCKET)
    .upload(storagePath, certFile.buffer, {
      contentType: certFile.contentType,
      upsert: true,
    });

  if (uploadError) throw new Error(`PDF upload failed: ${uploadError.message}`);

  const {
    data: { publicUrl },
  } = adminSupabase.storage.from(CERTIFICATES_BUCKET).getPublicUrl(storagePath);

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
    throw new Error(lastInsertError?.message || 'Failed to create CT certificate record.');
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
    description: `CT Certificate ${certNumber} issued for ${chemical.chemical_name}`,
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
      'CT Compliance Certificate Issued',
      `Your CT certificate ${certNumber} for ${chemical.chemical_name} is valid until ${expiryDate.toLocaleDateString('en-GB')}. You may now apply for TCC permits for this substance.`,
      '/client'
    );
  }

  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath(`/admin/clients/${clientId}/chemicals`);
  revalidatePath(`/admin/clients/${clientId}/rc-certificates`);
  revalidatePath('/client');

  return {
    success: true as const,
    message: `CT Certificate issued for ${chemical.chemical_name}.`,
    certificateId: cert.id,
    certNumber,
  };
}

export async function regenerateReachCertificateFile(certId: string) {
  const adminSupabase = createAdminClient();

  const { data: cert } = await adminSupabase
    .from('certificates')
    .select(
      'id, certificate_number, registration_number, tonnage_band, issued_at, expires_at, client_id, chemical_id, type, file_url'
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
    await clearReachCertificateStorageFiles(adminSupabase, certNumber, cert.file_url);

    const certFile = await buildReachCertificateStoredFile(client, chemical, certNumber, {
      registrationNumber: cert.registration_number,
      issuedDate: cert.issued_at.split('T')[0],
      validatedDate: cert.expires_at?.split('T')[0] || getLastDateOfYear(),
      tonnageBand: cert.tonnage_band,
      clientId: cert.client_id,
      chemicalId: cert.chemical_id,
    });
    const clientFolder = await resolveClientStorageFolder(
      adminSupabase,
      cert.client_id,
      client.company_name || 'client'
    );
    const storagePath = resolveCertificateStorageRelativePath({
      storedFileUrl: cert.file_url,
      folder: 'RC',
      clientFolder,
      date: cert.issued_at.split('T')[0],
      fileName: certFile.fileName,
    });

    await ensureCertificatesBucket(adminSupabase);
    const { error: uploadError } = await adminSupabase.storage
      .from(CERTIFICATES_BUCKET)
      .upload(storagePath, certFile.buffer, {
        contentType: certFile.contentType,
        upsert: true,
      });

    if (uploadError) return { success: false as const, error: uploadError.message };

    const {
      data: { publicUrl },
    } = adminSupabase.storage.from(CERTIFICATES_BUCKET).getPublicUrl(storagePath);

    // Keep existing live path when already correct — only update if path changed.
    if (!cert.file_url || !String(cert.file_url).includes(storagePath)) {
      await adminSupabase.from('certificates').update({ file_url: publicUrl }).eq('id', certId);
    }

    return { success: true as const, fileUrl: publicUrl };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Certificate file regeneration failed.';
    console.warn(`[RC] regenerateReachCertificateFile(${certId}):`, message);
    return { success: false as const, error: message };
  }
}

