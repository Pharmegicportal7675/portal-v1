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
  fileUrl: string | null;
};

function parseIssueDateIso(issueDateIso: string): { issueDate: Date; issueDateRaw: string } {
  const issueDateRaw = issueDateIso.split('T')[0];
  const issueDate = new Date(`${issueDateRaw}T12:00:00`);
  return { issueDate, issueDateRaw };
}

function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.length > 5 && buffer.subarray(0, 4).toString('latin1') === '%PDF';
}

export async function upsertTccCertificateForApplication(
  supabase: DbClient,
  params: {
    application: TccIssuanceApplication & Record<string, unknown>;
    issueDateIso: string;
    registrationNumber?: string | null;
    validUntilDateIso?: string | null;
    /** When true, approval must not proceed without a stored PDF on disk. */
    requireStoredPdf?: boolean;
  }
): Promise<UpsertTccCertificateResult> {
  const {
    application: rawApplication,
    issueDateIso,
    registrationNumber,
    validUntilDateIso,
    requireStoredPdf = false,
  } = params;
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

  let publicUrl = existingCert?.file_url || null;

  try {
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

    if (!isPdfBuffer(certFile.buffer)) {
      throw new Error('Generated certificate is not a valid PDF.');
    }

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
        contentType: certFile.contentType || 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      if (requireStoredPdf) {
        throw new Error(`Certificate PDF upload failed: ${uploadError.message}`);
      }
      console.warn(`[TCC ISSUANCE] Certificate upload warning: ${uploadError.message}`);
    } else {
      const {
        data: { publicUrl: uploadedUrl },
      } = supabase.storage.from(CERTIFICATES_BUCKET).getPublicUrl(storagePath);
      publicUrl = uploadedUrl;
    }
  } catch (pdfErr) {
    if (requireStoredPdf) {
      throw pdfErr instanceof Error
        ? pdfErr
        : new Error('Certificate PDF generation failed.');
    }
    console.error(
      '[TCC ISSUANCE] PDF generation failed during approval, recording certificate without PDF first:',
      pdfErr
    );
  }

  if (requireStoredPdf && !publicUrl?.trim()) {
    throw new Error('Certificate PDF was not saved on the server.');
  }

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

    return {
      certId: existingCert.id,
      certNumber,
      created: false,
      fileUrl: publicUrl,
    };
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

  return {
    certId: cert.id,
    certNumber,
    created: true,
    fileUrl: publicUrl,
  };
}
