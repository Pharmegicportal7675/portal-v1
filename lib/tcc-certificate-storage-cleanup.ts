import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { CERTIFICATES_BUCKET } from '@/lib/storage';
import {
  buildTccCertificatePdfInputFromCert,
  resolveTccCertificateDownloadFile,
} from '@/lib/tcc-certificate-pdf';

export type CleanupLegacyTccDocxResult = {
  totalTccCertificates: number;
  docxRemoved: number;
  fileUrlsUpdated: number;
  pdfsRegenerated: number;
  errors: string[];
};

type CleanupOptions = {
  dryRun?: boolean;
  regeneratePdfs?: boolean;
};

function pdfPublicUrl(supabase: SupabaseClient, certificateNumber: string): string {
  const {
    data: { publicUrl },
  } = supabase.storage.from(CERTIFICATES_BUCKET).getPublicUrl(`${certificateNumber}.pdf`);
  return publicUrl;
}

export async function cleanupLegacyTccDocxStorage(
  options: CleanupOptions = {}
): Promise<CleanupLegacyTccDocxResult> {
  const dryRun = options.dryRun ?? false;
  const regeneratePdfs = options.regeneratePdfs ?? true;
  const adminSupabase = createAdminClient();

  const { data: certs, error } = await adminSupabase
    .from('certificates')
    .select(
      `
      id,
      certificate_number,
      file_url,
      expires_at,
      registration_number,
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
        tonnage_band
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
    `
    )
    .eq('type', 'TCC');

  if (error) {
    throw new Error(`Failed to load TCC certificates: ${error.message}`);
  }

  const result: CleanupLegacyTccDocxResult = {
    totalTccCertificates: certs?.length ?? 0,
    docxRemoved: 0,
    fileUrlsUpdated: 0,
    pdfsRegenerated: 0,
    errors: [],
  };

  for (const cert of certs ?? []) {
    const certNumber = cert.certificate_number?.trim();
    if (!certNumber) continue;

    await cleanupOneTccDocx(adminSupabase, certNumber, cert, {
      dryRun,
      regeneratePdfs,
      result,
    });
  }

  const processed = new Set((certs ?? []).map((c) => c.certificate_number?.trim()).filter(Boolean));
  const { data: storageFiles, error: listError } = await adminSupabase.storage
    .from(CERTIFICATES_BUCKET)
    .list('', { limit: 1000 });

  if (listError) {
    result.errors.push(`Storage list failed: ${listError.message}`);
  } else {
    const orphanDocx = (storageFiles ?? [])
      .map((file) => file.name)
      .filter((name): name is string => Boolean(name))
      .filter((name) => /^TCC-.+\.docx$/i.test(name))
      .filter((name) => !processed.has(name.replace(/\.docx$/i, '')));

    for (const docxPath of orphanDocx) {
      if (!dryRun) {
        const { error: removeError } = await adminSupabase.storage
          .from(CERTIFICATES_BUCKET)
          .remove([docxPath]);

        if (removeError) {
          result.errors.push(`${docxPath}: orphan remove failed — ${removeError.message}`);
        } else {
          result.docxRemoved += 1;
        }
      } else {
        result.docxRemoved += 1;
      }
    }
  }

  return result;
}

async function cleanupOneTccDocx(
  adminSupabase: SupabaseClient,
  certNumber: string,
  cert: {
    id: string;
    certificate_number: string;
    file_url?: string | null;
    expires_at?: string | null;
    registration_number?: string | null;
    clients: unknown;
    chemicals?: unknown;
    tcc_applications?: unknown;
  },
  ctx: {
    dryRun: boolean;
    regeneratePdfs: boolean;
    result: CleanupLegacyTccDocxResult;
  }
): Promise<void> {
  const { dryRun, regeneratePdfs, result } = ctx;
  const docxPath = `${certNumber}.docx`;

  if (!dryRun) {
    const { error: removeError } = await adminSupabase.storage
      .from(CERTIFICATES_BUCKET)
      .remove([docxPath]);

    if (removeError) {
      result.errors.push(`${certNumber}: failed to remove DOCX — ${removeError.message}`);
    } else {
      result.docxRemoved += 1;
    }
  } else {
    result.docxRemoved += 1;
  }

  const fileUrl = cert.file_url?.trim() || '';
  if (fileUrl.toLowerCase().includes('.docx')) {
    const nextUrl = pdfPublicUrl(adminSupabase, certNumber);
    if (!dryRun) {
      const { error: updateError } = await adminSupabase
        .from('certificates')
        .update({ file_url: nextUrl })
        .eq('id', cert.id);

      if (updateError) {
        result.errors.push(`${certNumber}: failed to update file_url — ${updateError.message}`);
      } else {
        result.fileUrlsUpdated += 1;
      }
    } else {
      result.fileUrlsUpdated += 1;
    }
  }

  if (!regeneratePdfs || dryRun) return;

  try {
    const input = buildTccCertificatePdfInputFromCert(cert as never);
    const certFile = await resolveTccCertificateDownloadFile(adminSupabase, input);
    const { error: uploadError } = await adminSupabase.storage
      .from(CERTIFICATES_BUCKET)
      .upload(certFile.fileName, certFile.buffer, {
        contentType: certFile.contentType,
        upsert: true,
      });

    if (uploadError) {
      result.errors.push(`${certNumber}: PDF regenerate upload failed — ${uploadError.message}`);
      return;
    }

    const { error: urlError } = await adminSupabase
      .from('certificates')
      .update({ file_url: pdfPublicUrl(adminSupabase, certNumber) })
      .eq('id', cert.id);

    if (urlError) {
      result.errors.push(`${certNumber}: PDF uploaded but file_url update failed — ${urlError.message}`);
    } else {
      result.pdfsRegenerated += 1;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    result.errors.push(`${certNumber}: PDF regenerate failed — ${message}`);
  }
}
