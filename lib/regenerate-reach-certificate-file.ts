import { createAdminClient } from '@/lib/db/admin';
import { resolveCertificatesFilePath } from '@/lib/certificates-upload-root';
import { extractStorageRelativePath } from '@/lib/storage-paths';
import { REACH_CERTIFICATE_TYPE } from '@/lib/reach-certificate';
import { regenerateReachCertificateFile } from '@/services/reach-certificate-create';

function isReachFileMissingOnDisk(fileUrl: string | null | undefined): boolean {
  const relative = extractStorageRelativePath(fileUrl || '');
  if (!relative) return true;
  return !resolveCertificatesFilePath(relative);
}

/** Regenerate REACH/RC certificate PDFs that are missing on this host's disk (add-only). */
export async function regenerateMissingReachCertificateFiles(options?: {
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
    .select('id, certificate_number, file_url, type, status')
    .eq('type', REACH_CERTIFICATE_TYPE)
    .neq('status', 'revoked');

  if (options?.certificateId) {
    query = query.eq('id', options.certificateId);
  }

  const { data: certs, error } = await query;
  if (error) {
    throw new Error(`Failed to load RC certificates: ${error.message}`);
  }

  const result = {
    total: certs?.length ?? 0,
    missing: 0,
    regenerated: 0,
    errors: [] as string[],
  };

  for (const cert of certs ?? []) {
    const certNumber = cert.certificate_number?.trim() || cert.id;
    if (!isReachFileMissingOnDisk(cert.file_url)) {
      continue;
    }

    result.missing += 1;
    if (dryRun) {
      console.log(`[dry-run] would regenerate RC ${certNumber}`);
      continue;
    }

    try {
      const regen = await regenerateReachCertificateFile(cert.id);
      if (!regen.success) {
        result.errors.push(`${certNumber}: ${regen.error || 'RC regen failed'}`);
        continue;
      }
      result.regenerated += 1;
      console.log(`Regenerated RC ${certNumber}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      result.errors.push(`${certNumber}: ${message}`);
      console.error(`Failed RC ${certNumber}: ${message}`);
    }
  }

  return result;
}
