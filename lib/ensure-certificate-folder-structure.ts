import fs from 'node:fs';
import { createAdminClient } from '@/lib/db/admin';
import { getPrimaryCertificatesUploadRoot } from '@/lib/certificates-upload-root';
import { extractStorageRelativePath, sanitizeStorageFolderName } from '@/lib/storage-paths';
import path from 'node:path';

export type EnsureFoldersResult = {
  uploadRoot: string;
  total: number;
  created: number;
  existing: number;
  dryRun: boolean;
  folders: string[];
};

function clientFolderFromUrl(fileUrl: string | null | undefined): string | null {
  const relative = extractStorageRelativePath(fileUrl || '');
  if (!relative) return null;
  const [folder] = relative.split('/').filter(Boolean);
  return folder || null;
}

/** Ensure Client/Year/PO|RC|TCC folders exist for every client + DB-referenced path. */
export async function ensureCertificateFolderStructure(options?: {
  dryRun?: boolean;
}): Promise<EnsureFoldersResult> {
  const dryRun = options?.dryRun ?? false;
  const uploadRoot = getPrimaryCertificatesUploadRoot();
  if (!dryRun) {
    fs.mkdirSync(uploadRoot, { recursive: true });
  }

  const admin = createAdminClient();
  const dirs = new Set<string>();
  const clientFolders = new Map<string, string>();
  const year = String(new Date().getFullYear());

  const { data: clients, error: clientsError } = await admin
    .from('clients')
    .select('id, company_name')
    .order('company_name', { ascending: true });
  if (clientsError) throw new Error(clientsError.message);

  for (const client of clients ?? []) {
    clientFolders.set(String(client.id), sanitizeStorageFolderName(client.company_name));
  }

  const { data: certs, error: certsError } = await admin
    .from('certificates')
    .select('client_id, file_url, type, issued_at');
  if (certsError) throw new Error(certsError.message);

  for (const row of certs ?? []) {
    if (!row.file_url?.trim()) continue;
    const relative = extractStorageRelativePath(row.file_url || '');
    if (relative) {
      const parts = relative.split('/').filter(Boolean);
      if (parts.length >= 3) dirs.add(parts.slice(0, 3).join('/'));
    }
    const folder = clientFolderFromUrl(row.file_url);
    if (folder && row.client_id != null) {
      clientFolders.set(String(row.client_id), folder);
    }
  }

  const { data: apps, error: appsError } = await admin
    .from('tcc_applications')
    .select('client_id, bo_attachment_url');
  if (appsError) throw new Error(appsError.message);

  for (const row of apps ?? []) {
    if (!row.bo_attachment_url?.trim()) continue;
    const relative = extractStorageRelativePath(row.bo_attachment_url || '');
    if (relative) {
      const parts = relative.split('/').filter(Boolean);
      if (parts.length >= 3) dirs.add(parts.slice(0, 3).join('/'));
    }
    const folder = clientFolderFromUrl(row.bo_attachment_url);
    if (folder && row.client_id != null) {
      clientFolders.set(String(row.client_id), folder);
    }
  }

  for (const folder of clientFolders.values()) {
    for (const type of ['PO', 'RC', 'TCC'] as const) {
      dirs.add(`${folder}/${year}/${type}`);
    }
  }

  const sorted = [...dirs].sort();
  let created = 0;
  let existing = 0;

  for (const dir of sorted) {
    const full = path.join(uploadRoot, ...dir.split('/'));
    if (fs.existsSync(full)) {
      existing += 1;
      continue;
    }
    if (!dryRun) {
      fs.mkdirSync(full, { recursive: true });
    }
    created += 1;
  }

  return {
    uploadRoot,
    total: sorted.length,
    created,
    existing,
    dryRun,
    folders: sorted,
  };
}
