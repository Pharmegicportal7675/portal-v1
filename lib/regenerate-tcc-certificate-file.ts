import type { DbClient } from '@/lib/db/types';
import { createAdminClient } from '@/lib/db/admin';
import { CERTIFICATES_BUCKET, ensureCertificatesBucket } from '@/lib/storage';
import {
  extractStorageRelativePath,
  resolveCertificateStorageRelativePath,
} from '@/lib/storage-paths';
import { resolveCertificatesFilePath } from '@/lib/certificates-upload-root';
import { resolveClientStorageFolder } from '@/lib/client-storage-folder';
import {
  buildTccCertificatePdfInputFromStoredCert,
  resolveTccCertificateDownloadFile,
} from '@/lib/tcc-certificate-pdf';

const TCC_CERTIFICATE_RELATION_SELECT = `
  id,
  certificate_number,
  file_url,
  expires_at,
  issued_at,
  registration_number,
  client_id,
  type,
  tcc_application_id,
  clients (
    company_name,
    uuid_number,
    address,
    city,
    state,
    postal_code,
    country
  ),
  chemicals (
    chemical_name,
    cas_number,
    ec_number,
    tonnage_band,
    is_intermediate_substance
  ),
  tcc_applications!certificates_tcc_application_id_fkey (
    quantity_mt,
    export_date,
    tracking_id,
    registration_number,
    remarks,
    eu_importer_company_name,
    eu_importer_address,
    purchase_order_number,
    invoice_number,
    chemicals (
      chemical_name,
      cas_number,
      ec_number,
      tonnage_band
    )
  )
`;

const DEFAULT_ATTACHMENT_ORIGIN = 'https://portal.pharmegichealthcare.com';

function isStoredCertificateFileMissingOnDisk(
  fileUrl: string | null | undefined
): boolean {
  const relative = extractStorageRelativePath(fileUrl || '');
  if (!relative) return true;
  return !resolveCertificatesFilePath(relative);
}

/** True only when the file is absent on disk AND on the live static URL (safe for add-only repair). */
async function isStoredCertificateFileMissing(
  fileUrl: string | null | undefined
): Promise<boolean> {
  if (!isStoredCertificateFileMissingOnDisk(fileUrl)) return false;

  const relative = extractStorageRelativePath(fileUrl || '');
  if (!relative) return true;

  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/$/, '') ||
    DEFAULT_ATTACHMENT_ORIGIN;
  const publicPath = `/uploads/certificates/${relative.replace(/\\/g, '/')}`;

  try {
    const response = await fetch(`${origin}${publicPath}`, {
      method: 'HEAD',
      cache: 'no-store',
    });
    if (response.ok) return false;
  } catch {
    // treat as missing
  }

  return true;
}

/** Regenerate a TCC PDF from DB data and save it under the existing live folder path. */
export async function regenerateTccCertificateFile(
  adminSupabase: DbClient,
  certificateId: string
): Promise<{ fileUrl: string; storagePath: string }> {
  const { data: cert, error } = await adminSupabase
    .from('certificates')
    .select(TCC_CERTIFICATE_RELATION_SELECT)
    .eq('id', certificateId)
    .eq('type', 'TCC')
    .single();

  if (error || !cert) {
    throw new Error('Certificate not found for regeneration.');
  }

  const input = await buildTccCertificatePdfInputFromStoredCert(adminSupabase, cert as never);
  const certFile = await resolveTccCertificateDownloadFile(adminSupabase, input);
  const clientName = input.client.company_name || 'client';
  const clientFolder = await resolveClientStorageFolder(
    adminSupabase,
    cert.client_id,
    clientName
  );
  const issuedDate =
    cert.issued_at?.split('T')[0] ||
    input.issuedDate ||
    input.validUntilDate ||
    new Date().toISOString().slice(0, 10);

  const storagePath = resolveCertificateStorageRelativePath({
    storedFileUrl: cert.file_url,
    folder: 'TCC',
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

  if (uploadError) {
    throw new Error(`Certificate regeneration failed: ${uploadError.message}`);
  }

  const {
    data: { publicUrl },
  } = adminSupabase.storage.from(CERTIFICATES_BUCKET).getPublicUrl(storagePath);

  const existingRelative = extractStorageRelativePath(cert.file_url || '');
  if (!existingRelative || existingRelative !== storagePath) {
    await adminSupabase.from('certificates').update({ file_url: publicUrl }).eq('id', certificateId);
  }

  return { fileUrl: publicUrl, storagePath };
}

export async function regenerateMissingTccCertificateFiles(options?: {
  dryRun?: boolean;
  certificateId?: string;
}): Promise<{
  total: number;
  missing: number;
  regenerated: number;
  errors: string[];
}> {
  const dryRun = options?.dryRun ?? false;
  const adminSupabase = createAdminClient();

  let query = adminSupabase
    .from('certificates')
    .select('id, certificate_number, file_url')
    .eq('type', 'TCC');

  if (options?.certificateId) {
    query = query.eq('id', options.certificateId);
  }

  const { data: certs, error } = await query;
  if (error) {
    throw new Error(`Failed to load TCC certificates: ${error.message}`);
  }

  const result = {
    total: certs?.length ?? 0,
    missing: 0,
    regenerated: 0,
    errors: [] as string[],
  };

  for (const cert of certs ?? []) {
    const certNumber = cert.certificate_number?.trim() || cert.id;
    if (!(await isStoredCertificateFileMissing(cert.file_url))) {
      continue;
    }

    result.missing += 1;
    if (dryRun) {
      console.log(`[dry-run] would regenerate ${certNumber} at ${cert.file_url || '(new path)'}`);
      continue;
    }

    try {
      const { fileUrl } = await regenerateTccCertificateFile(adminSupabase, cert.id);
      result.regenerated += 1;
      console.log(`Regenerated ${certNumber} -> ${fileUrl}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      result.errors.push(`${certNumber}: ${message}`);
      console.error(`Failed ${certNumber}: ${message}`);
    }
  }

  return result;
}
