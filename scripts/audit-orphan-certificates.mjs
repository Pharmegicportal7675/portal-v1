/**
 * Audit orphan certificate PDF files: present under uploads but not referenced in DB.
 * Or scan DB for duplicate REACH certs (same client+substance+year).
 *
 * Usage:
 *   node scripts/audit-orphan-certificates.mjs
 *   node scripts/audit-orphan-certificates.mjs --client=COLOUR
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mariadb from 'mariadb';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientFilter = process.argv
  .find((arg) => arg.startsWith('--client='))
  ?.slice('--client='.length)
  ?.trim()
  .toLowerCase();

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
  const idx = fileUrl.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(fileUrl.slice(idx + marker.length).split('?')[0]);
}

const url = process.env.DATABASE_URL;
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
  `SELECT c.id, c.certificate_number, c.type, c.status, c.file_url,
          c.issued_at, c.expires_at, cl.company_name, ch.chemical_name, ch.cas_number
   FROM certificates c
   JOIN clients cl ON cl.id = c.client_id
   LEFT JOIN chemicals ch ON ch.id = c.chemical_id
   ORDER BY cl.company_name, c.type, c.issued_at DESC`
);

const referenced = new Set();
const byClientReach = new Map();

for (const cert of certs) {
  const relative = extractRelative(cert.file_url);
  if (relative) referenced.add(relative.replace(/\\/g, '/'));
  referenced.add(`${cert.certificate_number}.pdf`);

  if (cert.type === 'REACH' || cert.type === 'RC') {
    if (clientFilter && !String(cert.company_name).toLowerCase().includes(clientFilter)) {
      continue;
    }
    const year = String(cert.issued_at).slice(0, 4);
    const key = `${cert.company_name}||${cert.chemical_name || cert.cas_number}||${year}`;
    if (!byClientReach.has(key)) byClientReach.set(key, []);
    byClientReach.get(key).push(cert);
  }
}

console.log('=== COLOUR INDIA / COLORS_INDIA summary ===');
const colour = certs.filter((c) =>
  String(c.company_name).toUpperCase().includes('COLOUR INDIA')
);
console.log(
  colour.map((c) => ({
    type: c.type,
    number: c.certificate_number,
    chemical: c.chemical_name,
    file_url: c.file_url,
  }))
);

console.log('\n=== Duplicate REACH groups (same client+substance+year, count>1) ===');
let dupGroups = 0;
for (const [key, rows] of byClientReach) {
  if (rows.length <= 1) continue;
  dupGroups += 1;
  console.log(key, '=>', rows.map((r) => r.certificate_number).join(', '));
}
if (dupGroups === 0) console.log('(none)');

console.log('\n=== Known orphan disk files (COLORS_INDIA — not in DB) ===');
const knownOrphans = [
  'COLORS_INDIA/2026/RC/RC-2026-8WKBVR.pdf',
  'COLORS_INDIA/2026/RC/RC-2026-9MC76D.pdf',
  'COLORS_INDIA/2026/RC/RC-2026-CW5AUU.pdf',
  'COLORS_INDIA/2026/RC/RC-2026-HQYAKF.pdf',
  'COLORS_INDIA/2026/RC/RC-2026-PQNLON.pdf',
  'COLORS_INDIA/2026/RC/RC-2026-VILEWY.pdf',
];
for (const rel of knownOrphans) {
  const inDb = referenced.has(rel) || [...referenced].some((r) => r.endsWith(path.basename(rel)));
  console.log(inDb ? 'KEEP (referenced)' : 'DELETE (orphan)', rel);
}

console.log('\n=== Keep (valid DB paths for COLOUR INDIA) ===');
for (const cert of colour) {
  console.log(cert.certificate_number, '->', extractRelative(cert.file_url) || cert.file_url);
}

await conn.end();
