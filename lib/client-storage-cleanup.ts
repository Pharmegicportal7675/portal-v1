import fs from 'fs/promises';
import path from 'path';
import type { DbClient } from '@/lib/db/types';
import { CERTIFICATES_BUCKET } from '@/lib/storage';
import {
  extractStorageRelativePath,
  sanitizeStorageFolderName,
} from '@/lib/storage-paths';

export function getCertificatesUploadRoot(): string {
  return path.join(process.cwd(), 'public', 'uploads', 'certificates');
}

function collectFolderNamesFromRelativePath(relative: string, folders: Set<string>) {
  const normalized = relative.replace(/\\/g, '/').replace(/^\/+/, '');
  const first = normalized.split('/')[0];
  if (first && !first.includes('.')) {
    folders.add(first);
  }
}

export function collectClientStorageFolderNames(
  companyName: string,
  fileUrls: Array<string | null | undefined>
): string[] {
  const folders = new Set<string>();
  folders.add(sanitizeStorageFolderName(companyName));

  for (const url of fileUrls) {
    if (!url?.trim()) continue;
    const relative = extractStorageRelativePath(url.trim());
    if (relative) collectFolderNamesFromRelativePath(relative, folders);
  }

  return [...folders];
}

export async function deleteClientStorageFolder(folderName: string): Promise<void> {
  const safeFolder = folderName.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!safeFolder || safeFolder.includes('..')) return;

  const folderPath = path.join(getCertificatesUploadRoot(), ...safeFolder.split('/').filter(Boolean));
  await fs.rm(folderPath, { recursive: true, force: true }).catch(() => undefined);
}

export async function deleteClientStorageFilesAndFolders(
  adminSupabase: DbClient,
  clientId: string,
  companyName: string
) {
  const storagePaths = new Set<string>();
  const fileUrls: string[] = [];

  const [{ data: certRows }, { data: tccRows }] = await Promise.all([
    adminSupabase
      .from('certificates')
      .select('file_url, certificate_number')
      .eq('client_id', clientId),
    adminSupabase
      .from('tcc_applications')
      .select('bo_attachment_url')
      .eq('client_id', clientId),
  ]);

  for (const cert of certRows || []) {
    if (cert.file_url) {
      fileUrls.push(cert.file_url);
      const relative = extractStorageRelativePath(cert.file_url);
      if (relative) storagePaths.add(relative);
    }
    if (cert.certificate_number) {
      storagePaths.add(`${cert.certificate_number}.pdf`);
      storagePaths.add(`${cert.certificate_number}.docx`);
    }
  }

  for (const app of tccRows || []) {
    if (!app.bo_attachment_url) continue;
    fileUrls.push(app.bo_attachment_url);
    const relative = extractStorageRelativePath(app.bo_attachment_url);
    if (relative) storagePaths.add(relative);
  }

  if (storagePaths.size > 0) {
    await adminSupabase.storage.from(CERTIFICATES_BUCKET).remove([...storagePaths]);
  }

  const folderNames = collectClientStorageFolderNames(companyName, fileUrls);
  await Promise.all(folderNames.map((folder) => deleteClientStorageFolder(folder)));
}

export async function deleteClientExclusiveChemicals(
  adminSupabase: DbClient,
  clientId: string
): Promise<number> {
  const { data: assignments, error } = await adminSupabase
    .from('client_chemicals')
    .select('chemical_id')
    .eq('client_id', clientId);

  if (error) throw error;

  const rows = (assignments || []) as { chemical_id: string }[];
  const chemicalIds = [...new Set(rows.map((row) => row.chemical_id))];
  let deleted = 0;

  for (const chemicalId of chemicalIds) {
    const exclusive = await isChemicalExclusiveToClient(adminSupabase, clientId, chemicalId);
    if (!exclusive) continue;

    const { error: deleteError } = await adminSupabase.from('chemicals').delete().eq('id', chemicalId);
    if (deleteError) throw deleteError;
    deleted += 1;
  }

  return deleted;
}

async function isChemicalExclusiveToClient(
  adminSupabase: DbClient,
  clientId: string,
  chemicalId: string
): Promise<boolean> {
  const [{ data: otherAssignments }, { data: otherCerts }, { data: otherTcc }] = await Promise.all([
    adminSupabase
      .from('client_chemicals')
      .select('id')
      .eq('chemical_id', chemicalId)
      .neq('client_id', clientId)
      .limit(1),
    adminSupabase
      .from('certificates')
      .select('id')
      .eq('chemical_id', chemicalId)
      .neq('client_id', clientId)
      .limit(1),
    adminSupabase
      .from('tcc_applications')
      .select('id')
      .eq('chemical_id', chemicalId)
      .neq('client_id', clientId)
      .limit(1),
  ]);

  return !otherAssignments?.length && !otherCerts?.length && !otherTcc?.length;
}
