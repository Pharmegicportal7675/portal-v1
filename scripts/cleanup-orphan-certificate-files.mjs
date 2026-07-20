/**
 * Delete orphan certificate PDF files on the LIVE server disk.
 * Only removes files under CERTIFICATES_UPLOAD_ROOT that are NOT referenced
 * by any certificates.file_url / certificate_number in the database.
 *
 * SAFE defaults:
 *   --dry-run (default) — list only
 *   --apply — actually delete orphan files
 *   --folder=COLORS_INDIA — limit to one client folder
 *
 * Run ON Hostinger SSH:
 *   cd ~/domains/portal.pharmegichealthcare.com/nodejs
 *   node scripts/cleanup-orphan-certificate-files.mjs --folder=COLORS_INDIA --dry-run
 *   node scripts/cleanup-orphan-certificate-files.mjs --folder=COLORS_INDIA --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mariadb from 'mariadb';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apply = process.argv.includes('--apply');
const dryRun = !apply;
const folderArg = process.argv.find((arg) => arg.startsWith('--folder='));
const folderFilter = folderArg?.slice('--folder='.length)?.trim() || null;

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

function walkFiles(dir, base, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, base, out);
    else if (entry.isFile() && /\.(pdf|docx)$/i.test(entry.name)) {
      out.push(path.relative(base, full).replace(/\\/g, '/'));
    }
  }
  return out;
}

const uploadRoot =
  process.env.CERTIFICATES_UPLOAD_ROOT?.trim() ||
  path.join(root, 'public', 'uploads', 'certificates');

if (!fs.existsSync(uploadRoot)) {
  console.error(`Upload root not found: ${uploadRoot}`);
  console.error('Run this script ON the live Hostinger server.');
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const parsed = new URL(url);
const conn = await mariadb.createConnection({
  host: parsed.hostname,
  port: Number(parsed.port || 3306),
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
  database: parsed.pathname.replace(/^\//, ''),
  connectTimeout: 30000,
});

const certs = await conn.query(
  `SELECT certificate_number, file_url FROM certificates
   WHERE file_url IS NOT NULL OR certificate_number IS NOT NULL`
);

const referenced = new Set();
for (const cert of certs) {
  const relative = extractRelative(cert.file_url);
  if (relative) referenced.add(relative.replace(/\\/g, '/'));
  if (cert.certificate_number) {
    referenced.add(`${cert.certificate_number}.pdf`);
    referenced.add(`${cert.certificate_number}.docx`);
  }
}

const scanRoot = folderFilter ? path.join(uploadRoot, folderFilter) : uploadRoot;
const files = walkFiles(scanRoot, uploadRoot);
const orphans = files.filter((relative) => {
  if (referenced.has(relative)) return false;
  const base = path.basename(relative);
  if (referenced.has(base)) return false;
  return true;
});

console.log(`Upload root: ${uploadRoot}`);
console.log(`Scan: ${folderFilter || '(all)'}`);
console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY (delete orphans)'}`);
console.log(`Files scanned: ${files.length}`);
console.log(`Orphans: ${orphans.length}\n`);

let deleted = 0;
for (const relative of orphans.sort()) {
  const full = path.join(uploadRoot, ...relative.split('/'));
  if (dryRun) {
    console.log(`[dry-run] would delete ${relative}`);
  } else {
    try {
      fs.unlinkSync(full);
      console.log(`deleted ${relative}`);
      deleted += 1;
    } catch (err) {
      console.error(`failed ${relative}:`, err.message);
    }
  }
}

console.log(`\nDone. ${dryRun ? 'Would delete' : 'Deleted'} ${dryRun ? orphans.length : deleted} orphan file(s).`);
console.log('DB certificate rows were NOT modified.');

await conn.end();
