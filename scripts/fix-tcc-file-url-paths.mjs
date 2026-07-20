/**
 * Restore live folder names in certificates.file_url after a bad local regenerate.
 * SAFE: only UPDATEs file_url strings — no rows or files deleted.
 *
 * Usage: node scripts/fix-tcc-file-url-paths.mjs
 *        node scripts/fix-tcc-file-url-paths.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mariadb from 'mariadb';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');

/** wrong local folder -> live folder (from Hostinger / DB history) */
const FOLDER_FIXES = [
  ['Navpad_Pigments_Private_Limited', 'NAVPAD_PIGMENTS_PRIVATE_LIMITED'],
  ['Colour_India', 'COLOUR_INDIA'],
  ['Colors_India', 'COLOUR_INDIA'],
];

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

function fixUrl(url) {
  let next = url;
  for (const [wrong, right] of FOLDER_FIXES) {
    next = next.split(wrong).join(right);
  }
  return next;
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

const rows = await conn.query(
  `SELECT id, certificate_number, file_url FROM certificates WHERE type = 'TCC'`
);

let fixed = 0;
for (const row of rows) {
  const current = row.file_url || '';
  const next = fixUrl(current);
  if (next === current) continue;

  console.log(`${row.certificate_number}`);
  console.log(`  was: ${current}`);
  console.log(`  now: ${next}`);

  if (!dryRun) {
    await conn.query(`UPDATE certificates SET file_url = ? WHERE id = ?`, [next, row.id]);
  }
  fixed += 1;
}

console.log(`\n${dryRun ? '[dry-run] would fix' : 'Fixed'} ${fixed} TCC file_url path(s).`);
await conn.end();
