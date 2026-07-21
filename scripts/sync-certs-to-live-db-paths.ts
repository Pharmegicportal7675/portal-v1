/**
 * Sync certificate PDF files to match LIVE DB paths exactly.
 * - Uses certificates.file_url as source of truth for folder/file names
 * - Regenerates missing TCC / REACH PDFs
 * - Writes under public/uploads/certificates/<exact-db-relative-path>
 * - Builds certificates-for-live.zip for Hostinger File Manager upload
 *
 * Usage:
 *   npx tsx scripts/sync-certs-to-live-db-paths.ts
 *   npx tsx scripts/sync-certs-to-live-db-paths.ts --tcc-only
 *   npx tsx scripts/sync-certs-to-live-db-paths.ts --client=COLOUR
 */
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { createAdminClient } from '../lib/db/admin';
import { extractStorageRelativePath } from '../lib/storage-paths';
import { regenerateTccCertificateFile } from '../lib/regenerate-tcc-certificate-file';
import { regenerateReachCertificateFile } from '../services/reach-certificate-create';
import { REACH_CERTIFICATE_TYPE } from '../lib/reach-certificate';

config({ path: path.join(process.cwd(), '.env.local') });
config({ path: path.join(process.cwd(), '.env') });

const tccOnly = process.argv.includes('--tcc-only');
const clientFilter = process.argv
  .find((a) => a.startsWith('--client='))
  ?.slice('--client='.length)
  ?.trim()
  .toLowerCase();

const uploadRoot = path.join(process.cwd(), 'public', 'uploads', 'certificates');
process.env.CERTIFICATES_UPLOAD_ROOT = uploadRoot;

function ensureParent(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function findByBasename(rootDir: string, baseName: string): string | null {
  const target = baseName.toLowerCase();
  function walk(dir: string, depth: number): string | null {
    if (depth > 8 || !fs.existsSync(dir)) return null;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === target) return full;
      if (entry.isDirectory()) {
        const nested = walk(full, depth + 1);
        if (nested) return nested;
      }
    }
    return null;
  }
  return walk(rootDir, 0);
}

async function main() {
  fs.mkdirSync(uploadRoot, { recursive: true });
  const admin = createAdminClient();

  let query = admin
    .from('certificates')
    .select('id, certificate_number, type, file_url, client_id, clients(company_name)')
    .neq('status', 'revoked');

  const { data: certs, error } = await query;
  if (error) throw new Error(error.message);

  type CertRow = {
    id: string;
    certificate_number: string | null;
    type: string | null;
    file_url: string | null;
    client_id: string;
    clients: { company_name?: string } | { company_name?: string }[] | null;
  };

  let list: CertRow[] = (certs ?? []) as CertRow[];
  if (tccOnly) list = list.filter((c) => c.type === 'TCC');
  if (clientFilter) {
    list = list.filter((c) => {
      const clients = c.clients;
      const company = Array.isArray(clients) ? clients[0]?.company_name : clients?.company_name;
      return String(company || '')
        .toLowerCase()
        .includes(clientFilter);
    });
  }

  console.log(`Syncing ${list.length} certificate(s) to DB paths under:`);
  console.log(`  ${uploadRoot}\n`);

  const synced: string[] = [];
  const failed: string[] = [];

  for (const cert of list) {
    const number = cert.certificate_number?.trim() || cert.id;
    const relative =
      extractStorageRelativePath(cert.file_url || '') ||
      `${number}.pdf`;
    const dest = path.join(uploadRoot, ...relative.split('/').filter(Boolean));

    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      console.log(`OK exists ${relative}`);
      synced.push(relative);
      continue;
    }

    const found = findByBasename(uploadRoot, path.basename(relative));
    if (found && found !== dest) {
      ensureParent(dest);
      fs.copyFileSync(found, dest);
      console.log(`COPIED ${path.relative(uploadRoot, found)} -> ${relative}`);
      synced.push(relative);
      continue;
    }

    try {
      if (cert.type === 'TCC') {
        const result = await regenerateTccCertificateFile(admin, cert.id);
        console.log(`REGEN TCC ${number} -> ${result.storagePath}`);
        synced.push(result.storagePath);
      } else if (cert.type === REACH_CERTIFICATE_TYPE || cert.type === 'REACH' || cert.type === 'RC') {
        const result = await regenerateReachCertificateFile(cert.id);
        if (!result.success) throw new Error(result.error || 'RC regen failed');
        // Ensure exact DB relative path exists
        const afterRelative = extractStorageRelativePath(result.fileUrl || cert.file_url || '') || relative;
        const afterDest = path.join(uploadRoot, ...afterRelative.split('/').filter(Boolean));
        if (!fs.existsSync(afterDest)) {
          const byName = findByBasename(uploadRoot, `${number}.pdf`);
          if (byName) {
            ensureParent(dest);
            fs.copyFileSync(byName, dest);
          }
        } else if (afterDest !== dest && fs.existsSync(afterDest)) {
          ensureParent(dest);
          fs.copyFileSync(afterDest, dest);
        }
        console.log(`REGEN RC ${number} -> ${relative}`);
        synced.push(relative);
      } else {
        console.log(`SKIP type=${cert.type} ${number}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`FAIL ${number}: ${message}`);
      failed.push(`${number}: ${message}`);
    }
  }

  const zipPath = path.join(process.cwd(), 'certificates-for-live.zip');
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

  const zip = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path "${uploadRoot}\\*" -DestinationPath "${zipPath}" -Force`,
    ],
    { encoding: 'utf8' }
  );

  if (zip.status === 0 && fs.existsSync(zipPath)) {
    const mb = (fs.statSync(zipPath).size / (1024 * 1024)).toFixed(1);
    console.log(`\nZip ready: certificates-for-live.zip (${mb} MB)`);
    console.log('Upload/extract into Hostinger:');
    console.log('  nodejs/public/uploads/certificates/');
  } else {
    console.log('\nZip failed — upload the folder public/uploads/certificates manually.');
    if (zip.stderr) console.log(zip.stderr);
  }

  console.log(`\nSynced: ${synced.length}`);
  console.log(`Failed: ${failed.length}`);
  if (failed.length) {
    for (const line of failed) console.log(`  - ${line}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
