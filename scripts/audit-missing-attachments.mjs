/**
 * Audit PO attachments and TCC certificate PDFs on the live server.
 *
 * Usage:
 *   node scripts/audit-missing-attachments.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mariadb from 'mariadb';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
  'https://portal.pharmegichealthcare.com';

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

function toPublicPath(url) {
  if (!url) return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('/uploads/')) return trimmed;
  try {
    return new URL(trimmed).pathname;
  } catch {
    return null;
  }
}

async function existsOnServer(publicPath) {
  if (!publicPath) return false;
  try {
    const res = await fetch(`${ORIGIN}${publicPath}`, { method: 'HEAD', cache: 'no-store' });
    return res.status === 200;
  } catch {
    return false;
  }
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
  connectTimeout: 20000,
});

console.log(`Auditing attachments against ${ORIGIN}\n`);

const poRows = await conn.query(
  `SELECT id, bo_attachment_name, bo_attachment_url, created_at
   FROM tcc_applications
   WHERE bo_attachment_url IS NOT NULL AND TRIM(bo_attachment_url) <> ''
   ORDER BY created_at ASC`
);

let poOk = 0;
let poMissing = 0;
console.log('=== PO attachments ===');
for (const row of poRows) {
  const publicPath = toPublicPath(row.bo_attachment_url);
  const ok = await existsOnServer(publicPath);
  if (ok) {
    poOk += 1;
    console.log(`OK   ${row.bo_attachment_name || row.id}`);
  } else {
    poMissing += 1;
    console.log(`MISS ${row.bo_attachment_name || row.id}`);
    console.log(`     ${publicPath || row.bo_attachment_url}`);
  }
}
console.log(`PO summary: ${poOk} found, ${poMissing} missing\n`);

const tccRows = await conn.query(
  `SELECT id, certificate_number, file_url, issued_at
   FROM certificates
   WHERE type = 'TCC' AND file_url IS NOT NULL AND TRIM(file_url) <> ''
   ORDER BY issued_at ASC`
);

let tccOk = 0;
let tccMissing = 0;
console.log('=== TCC certificate PDFs ===');
for (const row of tccRows) {
  const publicPath = toPublicPath(row.file_url);
  const ok = await existsOnServer(publicPath);
  if (ok) {
    tccOk += 1;
    console.log(`OK   ${row.certificate_number}`);
  } else {
    tccMissing += 1;
    console.log(`MISS ${row.certificate_number}`);
    console.log(`     ${publicPath || row.file_url}`);
  }
}
console.log(`TCC summary: ${tccOk} found, ${tccMissing} missing\n`);

if (tccMissing > 0) {
  console.log('Fix missing TCC PDFs on the server:');
  console.log('  npx tsx scripts/regenerate-missing-tcc-pdfs.ts');
}

if (poMissing > 0) {
  console.log('Missing PO files cannot be regenerated from the database.');
  console.log('Restore them from a Hostinger backup, or ask clients to re-upload POs.');
}

await conn.end();
