/**
 * Move certificate files from legacy layout to:
 *   {ClientName}/{Year}/{PO|RC|TCC}/{file}
 *
 * Legacy layouts migrated:
 *   bo/{Client}/{date}/file  → {Client}/{year}/PO/file
 *   rc/{Client}/{date}/file  → {Client}/{year}/RC/file
 *   tcc/{Client}/{date}/file → {Client}/{year}/TCC/file
 *   {RC|TCC}-*.pdf at root   → {Client}/{year}/RC|TCC/file (via DB lookup)
 *   PO files via DB URLs     → {Client}/{year}/PO/file
 *
 * Usage:
 *   npx tsx scripts/migrate-storage-layout.ts
 *   npx tsx scripts/migrate-storage-layout.ts --dry-run
 */
import fs from 'fs/promises';
import path from 'path';
import { createAdminClient } from '../lib/db/admin';
import {
  CERTIFICATES_UPLOAD_URL_MARKER,
  extractStorageRelativePath,
  formatStorageYearFolder,
  sanitizeStorageFolderName,
  transformLegacyStorageRelativePath,
} from '../lib/storage-paths';

const UPLOAD_ROOT = path.join(process.cwd(), 'public', 'uploads', 'certificates');
const dryRun = process.argv.includes('--dry-run');

const LEGACY_TYPE_FOLDERS: Record<string, 'PO' | 'RC' | 'TCC'> = {
  bo: 'PO',
  rc: 'RC',
  tcc: 'TCC',
};

function publicUrlForRelative(relativePath: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}${CERTIFICATES_UPLOAD_URL_MARKER}${relativePath.replace(/\\/g, '/')}`;
}

function resolveUploadPath(relative: string): string {
  return path.join(UPLOAD_ROOT, ...relative.split('/').filter(Boolean));
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function moveFile(src: string, dest: string): Promise<boolean> {
  if (!(await fileExists(src))) return false;

  if (dryRun) {
    console.log(`[dry-run] ${path.relative(UPLOAD_ROOT, src)} → ${path.relative(UPLOAD_ROOT, dest)}`);
    return true;
  }

  await fs.mkdir(path.dirname(dest), { recursive: true });
  try {
    await fs.rename(src, dest);
  } catch {
    await fs.copyFile(src, dest);
    await fs.unlink(src);
  }
  console.log(`Moved: ${path.relative(UPLOAD_ROOT, src)} → ${path.relative(UPLOAD_ROOT, dest)}`);
  return true;
}

async function removeEmptyDirs(dir: string): Promise<void> {
  if (!(await isDirectory(dir))) return;
  const entries = await fs.readdir(dir);
  for (const entry of entries) {
    await removeEmptyDirs(path.join(dir, entry));
  }
  const remaining = await fs.readdir(dir);
  if (remaining.length === 0 && dir !== UPLOAD_ROOT) {
    if (!dryRun) await fs.rmdir(dir);
    console.log(`Removed empty dir: ${path.relative(UPLOAD_ROOT, dir)}`);
  }
}

function recordUrlMap(urlMap: Map<string, string>, oldRelative: string, newRelative: string): void {
  urlMap.set(oldRelative, newRelative);
  urlMap.set(publicUrlForRelative(oldRelative), publicUrlForRelative(newRelative));
}

async function migrateLegacyTypeFolders(): Promise<Map<string, string>> {
  const urlMap = new Map<string, string>();

  for (const [legacyFolder, targetFolder] of Object.entries(LEGACY_TYPE_FOLDERS)) {
    const typeDir = path.join(UPLOAD_ROOT, legacyFolder);
    if (!(await isDirectory(typeDir))) continue;

    const clients = await fs.readdir(typeDir);
    for (const client of clients) {
      const clientDir = path.join(typeDir, client);
      if (!(await isDirectory(clientDir))) continue;

      for (const dateFolder of await fs.readdir(clientDir)) {
        const dateDir = path.join(clientDir, dateFolder);
        if (!(await isDirectory(dateDir))) continue;

        const year = formatStorageYearFolder(dateFolder);
        for (const file of await fs.readdir(dateDir)) {
          const src = path.join(dateDir, file);
          if ((await fs.stat(src)).isDirectory()) continue;

          const relativeDest = path.join(client, year, targetFolder, file).replace(/\\/g, '/');
          const dest = resolveUploadPath(relativeDest);
          const oldRelative = path.join(legacyFolder, client, dateFolder, file).replace(/\\/g, '/');

          if (await moveFile(src, dest)) {
            recordUrlMap(urlMap, oldRelative, relativeDest);
          }
        }
      }
    }

    if (!dryRun) await removeEmptyDirs(typeDir);
  }

  return urlMap;
}

async function migratePoFromDatabase(
  supabase: ReturnType<typeof createAdminClient>,
  urlMap: Map<string, string>
): Promise<void> {
  const { data: apps, error } = await supabase
    .from('tcc_applications')
    .select('id, bo_attachment_url, bo_attachment_name, export_date, clients (company_name)');

  if (error) throw error;

  for (const app of apps || []) {
    const url = app.bo_attachment_url as string | null;
    if (!url?.trim()) continue;

    const clientRaw = app.clients as { company_name?: string } | { company_name?: string }[] | null;
    const client = Array.isArray(clientRaw) ? clientRaw[0] : clientRaw;
    const clientName = sanitizeStorageFolderName(client?.company_name || 'unknown-client');
    const year = formatStorageYearFolder(app.export_date);
    const fileName = (
      (app.bo_attachment_name as string | null)?.trim() ||
      path.basename(extractStorageRelativePath(url) || 'po-attachment.pdf')
    ).replace(/[^a-zA-Z0-9._-]/g, '_');

    const relativeDest = `${clientName}/${year}/PO/${fileName}`;
    const dest = resolveUploadPath(relativeDest);
    const newUrl = publicUrlForRelative(relativeDest);

    const relative = extractStorageRelativePath(url);
    const transformed = relative ? transformLegacyStorageRelativePath(relative) : null;
    const targetRelative = transformed || relativeDest;

    if (relative && relative !== targetRelative) {
      const src = resolveUploadPath(relative);
      const finalDest = resolveUploadPath(targetRelative);
      if (await moveFile(src, finalDest)) {
        recordUrlMap(urlMap, relative, targetRelative);
      }
    } else if (!(await fileExists(dest)) && relative) {
      const src = resolveUploadPath(relative);
      if (await moveFile(src, dest)) {
        recordUrlMap(urlMap, relative, relativeDest);
      }
    }

    const resolvedUrl = publicUrlForRelative(
      urlMap.get(relative || '') || targetRelative
    );

    if (!dryRun && url !== resolvedUrl && url !== newUrl) {
      const finalUrl = urlMap.has(relative || '') ? resolvedUrl : newUrl;
      await supabase.from('tcc_applications').update({ bo_attachment_url: finalUrl }).eq('id', app.id);
      console.log(`DB tcc_applications.bo_attachment_url updated for id ${app.id}`);
    } else if (!dryRun && url !== newUrl && (await fileExists(dest))) {
      await supabase.from('tcc_applications').update({ bo_attachment_url: newUrl }).eq('id', app.id);
      console.log(`DB tcc_applications.bo_attachment_url updated for id ${app.id}`);
    }
  }
}

async function migrateRootCertificates(supabase: ReturnType<typeof createAdminClient>): Promise<void> {
  const { data: certs, error } = await supabase
    .from('certificates')
    .select('id, certificate_number, type, file_url, issued_at, clients (company_name)')
    .order('issued_at', { ascending: false });

  if (error) throw error;

  for (const cert of certs || []) {
    const fileName = `${cert.certificate_number}.pdf`;
    const rootPath = path.join(UPLOAD_ROOT, fileName);
    if (!(await fileExists(rootPath))) continue;

    const clientRaw = cert.clients as { company_name?: string } | { company_name?: string }[] | null;
    const client = Array.isArray(clientRaw) ? clientRaw[0] : clientRaw;
    const clientName = sanitizeStorageFolderName(client?.company_name || 'unknown-client');
    const folder = cert.type === 'TCC' ? 'TCC' : 'RC';
    const year = formatStorageYearFolder(cert.issued_at);
    const relativeDest = path.join(clientName, year, folder, fileName).replace(/\\/g, '/');
    const dest = resolveUploadPath(relativeDest);

    await moveFile(rootPath, dest);

    const newUrl = publicUrlForRelative(relativeDest);
    if (!dryRun && cert.file_url !== newUrl) {
      await supabase.from('certificates').update({ file_url: newUrl }).eq('id', cert.id);
      console.log(`DB certificates.file_url updated: ${cert.certificate_number}`);
    }
  }
}

async function updateDatabaseUrls(
  supabase: ReturnType<typeof createAdminClient>,
  urlMap: Map<string, string>
): Promise<void> {
  if (dryRun) return;

  const { data: certs } = await supabase.from('certificates').select('id, file_url');
  for (const cert of certs || []) {
    if (!cert.file_url) continue;
    const relative = extractStorageRelativePath(cert.file_url);
    if (!relative) continue;

    const mapped =
      urlMap.get(relative) ||
      urlMap.get(cert.file_url) ||
      transformLegacyStorageRelativePath(relative);
    if (!mapped || mapped === relative) continue;

    const newUrl = mapped.startsWith('http') ? mapped : publicUrlForRelative(mapped);
    if (newUrl !== cert.file_url) {
      await supabase.from('certificates').update({ file_url: newUrl }).eq('id', cert.id);
      console.log(`DB certificates.file_url updated for id ${cert.id}`);
    }
  }

  const { data: apps } = await supabase.from('tcc_applications').select('id, bo_attachment_url');

  for (const app of apps || []) {
    const url = app.bo_attachment_url as string | null;
    if (!url?.trim()) continue;

    const relative = extractStorageRelativePath(url);
    if (!relative) continue;

    const mapped = urlMap.get(relative) || urlMap.get(url) || transformLegacyStorageRelativePath(relative);
    if (!mapped || mapped === relative) continue;

    const newUrl = mapped.startsWith('http') ? mapped : publicUrlForRelative(mapped);
    if (newUrl !== url) {
      await supabase.from('tcc_applications').update({ bo_attachment_url: newUrl }).eq('id', app.id);
      console.log(`DB tcc_applications.bo_attachment_url updated for id ${app.id}`);
    }
  }
}

async function main() {
  console.log(`Migrating storage layout under ${UPLOAD_ROOT}`);
  console.log(`dry-run: ${dryRun}`);

  const urlMap = await migrateLegacyTypeFolders();
  const supabase = createAdminClient();
  await migratePoFromDatabase(supabase, urlMap);
  await migrateRootCertificates(supabase);
  await updateDatabaseUrls(supabase, urlMap);

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
