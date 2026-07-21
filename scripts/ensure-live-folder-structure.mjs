/**
 * Ensure live folder structure exists for every client + certificate/PO in the DB:
 *   {ClientFolder}/{Year}/{PO|RC|TCC}/
 *
 * Run ON Hostinger (nodejs app root):
 *   node scripts/ensure-live-folder-structure.mjs
 *   node scripts/ensure-live-folder-structure.mjs --dry-run
 *
 * Safe: creates directories only. Never deletes files or DB rows.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mariadb from 'mariadb';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.join(root, '.env.local'));
loadEnvFile(path.join(root, '.env'));

function sanitizeFolderName(name) {
  const slug = String(name || 'unknown-client')
    .trim()
    .replace(/[^a-zA-Z0-9._\s-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);
  return slug || 'unknown-client';
}

function extractRelative(fileUrl) {
  if (!fileUrl) return null;
  const marker = '/uploads/certificates/';
  const idx = String(fileUrl).indexOf(marker);
  if (idx === -1) return null;
  try {
    return decodeURIComponent(String(fileUrl).slice(idx + marker.length).split('?')[0]);
  } catch {
    return String(fileUrl).slice(idx + marker.length).split('?')[0];
  }
}

function clientFolderFromUrl(fileUrl) {
  const relative = extractRelative(fileUrl);
  if (!relative) return null;
  const [folder] = relative.split('/').filter(Boolean);
  return folder || null;
}

const uploadRoot =
  process.env.CERTIFICATES_UPLOAD_ROOT?.trim() ||
  path.join(root, 'public', 'uploads', 'certificates');

if (!dryRun) {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

console.log(dryRun ? '[dry-run] Would use upload root:' : 'Upload root:', uploadRoot);
console.log('Structure target: ClientName / Year / PO|RC|TCC /\n');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is missing.');
  process.exit(1);
}

const parsed = new URL(process.env.DATABASE_URL);
const conn = await mariadb.createConnection({
  host: parsed.hostname,
  port: Number(parsed.port || 3306),
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
  database: parsed.pathname.replace(/^\//, ''),
  connectTimeout: 30000,
});

const dirs = new Set();
const clientFolders = new Map(); // clientId -> preferred folder name
const year = String(new Date().getFullYear());

const clients = await conn.query(
  `SELECT id, company_name, status FROM clients ORDER BY company_name ASC`
);

for (const client of clients) {
  clientFolders.set(String(client.id), sanitizeFolderName(client.company_name));
}

const certs = await conn.query(
  `SELECT client_id, file_url, type, issued_at
   FROM certificates
   WHERE file_url IS NOT NULL AND TRIM(file_url) <> ''`
);

for (const row of certs) {
  const relative = extractRelative(row.file_url);
  if (!relative) continue;
  const parts = relative.split('/').filter(Boolean);
  if (parts.length >= 3) {
    dirs.add(parts.slice(0, 3).join('/'));
  }
  const folder = clientFolderFromUrl(row.file_url);
  if (folder && row.client_id != null) {
    clientFolders.set(String(row.client_id), folder);
  }
}

const apps = await conn.query(
  `SELECT client_id, bo_attachment_url, created_at
   FROM tcc_applications
   WHERE bo_attachment_url IS NOT NULL AND TRIM(bo_attachment_url) <> ''`
);

for (const row of apps) {
  const relative = extractRelative(row.bo_attachment_url);
  if (!relative) continue;
  const parts = relative.split('/').filter(Boolean);
  if (parts.length >= 3) {
    dirs.add(parts.slice(0, 3).join('/'));
  }
  const folder = clientFolderFromUrl(row.bo_attachment_url);
  if (folder && row.client_id != null) {
    clientFolders.set(String(row.client_id), folder);
  }
}

// Every client gets current-year PO / RC / TCC folders (even if empty).
for (const folder of clientFolders.values()) {
  for (const type of ['PO', 'RC', 'TCC']) {
    dirs.add(`${folder}/${year}/${type}`);
  }
}

const sorted = [...dirs].sort();
let created = 0;
let existing = 0;

for (const dir of sorted) {
  const full = path.join(uploadRoot, ...dir.split('/'));
  const already = fs.existsSync(full);
  if (already) {
    existing += 1;
    continue;
  }
  if (dryRun) {
    console.log('would create', dir);
    created += 1;
    continue;
  }
  fs.mkdirSync(full, { recursive: true });
  console.log('created', dir);
  created += 1;
}

console.log('\n--- Client folders (from DB) ---');
const uniqueClients = [...new Set(clientFolders.values())].sort();
for (const name of uniqueClients) {
  console.log(`  ${name}/`);
  console.log(`    ${year}/PO|RC|TCC`);
}

console.log(
  `\nDone. ${dryRun ? 'Would ensure' : 'Ensured'} ${dirs.size} folders` +
    ` (${created} ${dryRun ? 'missing' : 'newly created'}, ${existing} already present).`
);
console.log('Structure: ClientName / Year / PO|RC|TCC /');
console.log('No files or DB rows were deleted.');

await conn.end();
