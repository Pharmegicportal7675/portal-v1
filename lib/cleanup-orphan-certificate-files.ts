import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/db/admin';
import { getPrimaryCertificatesUploadRoot } from '@/lib/certificates-upload-root';
import { extractStorageRelativePath } from '@/lib/storage-paths';

export type OrphanCleanupResult = {
  uploadRoot: string;
  scanned: number;
  orphans: string[];
  deleted: number;
  dryRun: boolean;
  errors: string[];
};

function walkFiles(dir: string, base: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, base, out);
    } else if (entry.isFile() && /\.(pdf|docx)$/i.test(entry.name)) {
      out.push(path.relative(base, full).replace(/\\/g, '/'));
    }
  }
  return out;
}

/** Delete certificate files on disk that are not referenced by any DB row. */
export async function cleanupOrphanCertificateFiles(options?: {
  dryRun?: boolean;
  folder?: string | null;
}): Promise<OrphanCleanupResult> {
  const dryRun = options?.dryRun ?? true;
  const folder = options?.folder?.trim() || null;
  const uploadRoot = getPrimaryCertificatesUploadRoot();
  const adminSupabase = createAdminClient();

  const { data: certs, error } = await adminSupabase
    .from('certificates')
    .select('certificate_number, file_url');

  if (error) {
    throw new Error(`Failed to load certificates: ${error.message}`);
  }

  const referenced = new Set<string>();
  for (const cert of certs ?? []) {
    const relative = extractStorageRelativePath(cert.file_url || '');
    if (relative) referenced.add(relative.replace(/\\/g, '/'));
    const number = cert.certificate_number?.trim();
    if (number) {
      referenced.add(`${number}.pdf`);
      referenced.add(`${number}.docx`);
    }
  }

  const scanRoot = folder ? path.join(uploadRoot, folder) : uploadRoot;
  const files = walkFiles(scanRoot, uploadRoot);
  const orphans = files.filter((relative) => {
    if (referenced.has(relative)) return false;
    const base = path.basename(relative);
    return !referenced.has(base);
  });

  const result: OrphanCleanupResult = {
    uploadRoot,
    scanned: files.length,
    orphans,
    deleted: 0,
    dryRun,
    errors: [],
  };

  if (dryRun) return result;

  for (const relative of orphans) {
    const full = path.join(uploadRoot, ...relative.split('/'));
    try {
      fs.unlinkSync(full);
      result.deleted += 1;
    } catch (err) {
      result.errors.push(
        `${relative}: ${err instanceof Error ? err.message : 'delete failed'}`
      );
    }
  }

  return result;
}
