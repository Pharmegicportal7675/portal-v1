import type { DbClient } from '@/lib/db/types';
import { buildTccCertificateStoredFile } from '@/lib/tcc-pdf-data';
import { resolveCertificateStorageRelativePath } from '@/lib/storage-paths';
import { resolveClientStorageFolder } from '@/lib/client-storage-folder';
import { resolveTccPdfChemicalTonnageBand } from '@/lib/tcc-certificate-pdf';
import type { TccPdfChemical } from '@/lib/tcc-certificate-html-data';
import { generateUniqueTccCertificateNumber } from '@/lib/tcc-certificate-number';
import { resolveTccValidUntilIso } from '@/lib/tcc-certificate-dates';
import { readTccApplicationValidUntilDate } from '@/lib/tcc-application-valid-until';
import { CERTIFICATES_BUCKET, ensureCertificatesBucket } from '@/lib/storage';

type TccIssuanceApplication = {
  id: string;
  client_id: string;
  chemical_id: string;
  export_date?: string | null;
  reach_certificate_id?: string | null;
  tracking_id?: string | null;
  clients: Record<string, unknown> | Record<string, unknown>[];
  chemicals: Record<string, unknown> | Record<string, unknown>[];
};

function unwrapRelation<T>(value: T | T[] | null | undefined): T {
  if (Array.isArray(value)) {
    const row = value[0];
    if (!row) throw new Error('Missing related certificate record.');
    return row;
  }
  if (!value) throw new Error('Missing related certificate record.');
  return value;
}

function normalizeIssuanceApplication(
  application: TccIssuanceApplication & Record<string, unknown>
): TccIssuanceApplication & Record<string, unknown> {
  return {
    ...application,
    clients: unwrapRelation(application.clients),
    chemicals: unwrapRelation(application.chemicals),
  };
}

type UpsertTccCertificateResult = {
  certId: string;
  certNumber: string;
  created: boolean;
};

function parseIssueDateIso(issueDateIso: string): { issueDate: Date; issueDateRaw: string } {
  const issueDateRaw = issueDateIso.split('T')[0];
  const issueDate = new Date(`${issueDateRaw}T12:00:00`);
  return { issueDate, issueDateRaw };
}

export async function upsertTccCertificateForApplication(
  supabase: DbClient,
  params: {
    application: TccIssuanceApplication & Record<string, unknown>;
    issueDateIso: string;
    registrationNumber?: string | null;
    validUntilDateIso?: string | null;
  }
): Promise<UpsertTccCertificateResult> {
  const { application: rawApplication, issueDateIso, registrationNumber, validUntilDateIso } = params;
  const application = normalizeIssuanceApplication(rawApplication);
  const { issueDate, issueDateRaw } = parseIssueDateIso(issueDateIso);
  const exportDate =
    application.export_date != null ? String(application.export_date).split('T')[0] : null;
  const storedValidUntil =
    validUntilDateIso?.trim() || readTccApplicationValidUntilDate(application);
  const validUntilIso = resolveTccValidUntilIso({
    validUntilDate: storedValidUntil,
    exportDate,
    issueDate: issueDateRaw,
  });
  const expiryDate = new Date(`${validUntilIso}T12:00:00`);

  const { data: existingCert } = await supabase
    .from('certificates')
    .select('id, certificate_number, file_url')
    .eq('tcc_application_id', application.id)
    .eq('type', 'TCC')
    .maybeSingle();

  const certNumber =
    existingCert?.certificate_number?.trim() ||
    (await generateUniqueTccCertificateNumber(supabase));

  const chemical = await resolveTccPdfChemicalTonnageBand(supabase, {
    clientId: application.client_id,
    chemicalId: application.chemical_id,
    exportDate: application.export_date,
    reachCertificateId: application.reach_certificate_id,
    chemical: application.chemicals as TccPdfChemical,
  });

  const certFile = await buildTccCertificateStoredFile({
    certNumber,
    client: application.clients as never,
    chemical,
    application: application as never,
    registrationNumber: registrationNumber ?? null,
    validUntilDate: validUntilIso,
    deliveryChallanNo: application.tracking_id,
    issuedDate: issueDateRaw,
  });
  const clientName =
    (application.clients as { company_name?: string | null } | null)?.company_name || 'client';
  const clientFolder = await resolveClientStorageFolder(
    supabase,
    application.client_id,
    clientName
  );
  const storagePath = resolveCertificateStorageRelativePath({
    storedFileUrl: existingCert?.file_url,
    folder: 'TCC',
    clientFolder,
    date: issueDateRaw,
    fileName: certFile.fileName,
  });

  await ensureCertificatesBucket(supabase);
  const { error: uploadError } = await supabase.storage
    .from(CERTIFICATES_BUCKET)
    .upload(storagePath, certFile.buffer, {
      contentType: certFile.contentType,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Certificate upload failed: ${uploadError.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(CERTIFICATES_BUCKET).getPublicUrl(storagePath);

  if (existingCert) {
    const { error: updateError } = await supabase
      .from('certificates')
      .update({
        file_url: publicUrl,
        issued_at: issueDate.toISOString(),
        expires_at: expiryDate.toISOString(),
        registration_number: registrationNumber ?? null,
        status: 'active',
      })
      .eq('id', existingCert.id);

    if (updateError) throw updateError;

    return { certId: existingCert.id, certNumber, created: false };
  }

  const { data: cert, error: insertError } = await supabase
    .from('certificates')
    .insert({
      client_id: application.client_id,
      chemical_id: application.chemical_id,
      tcc_application_id: application.id,
      certificate_number: certNumber,
      registration_number: registrationNumber ?? null,
      type: 'TCC',
      file_url: publicUrl,
      issued_at: issueDate.toISOString(),
      expires_at: expiryDate.toISOString(),
      status: 'active',
      mail_sent: false,
      mail_resend_count: 0,
    })
    .select('id')
    .single();

  if (insertError) throw insertError;

  return { certId: cert.id, certNumber, created: true };
}
