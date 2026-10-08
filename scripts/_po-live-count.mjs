import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mariadb from 'mariadb';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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

const ORIGIN = 'https://portal.pharmegichealthcare.com';
const parsed = new URL(process.env.DATABASE_URL);
const conn = await mariadb.createConnection({
  host: parsed.hostname,
  port: Number(parsed.port || 3306),
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
  database: parsed.pathname.replace(/^\//, ''),
  connectTimeout: 20000,
});

const apps = await conn.query(
  `SELECT a.id, a.bo_attachment_url, a.bo_attachment_name, c.company_name
   FROM tcc_applications a
   LEFT JOIN clients c ON c.id = a.client_id`
);

let ok = 0;
let miss = 0;
const missing = [];
for (const app of apps) {
  const url = (app.bo_attachment_url || '').trim();
  const i = url.indexOf('/uploads/certificates/');
  const p = i >= 0 ? url.slice(i).split('?')[0] : null;
  if (!p) {
    miss += 1;
    continue;
  }
  const res = await fetch(`${ORIGIN}${p}`, { method: 'HEAD', cache: 'no-store' });
  if (res.status === 200) ok += 1;
  else {
    miss += 1;
    if (missing.length < 15) {
      missing.push({
        company: app.company_name,
        name: app.bo_attachment_name,
        status: res.status,
      });
    }
  }
}
console.log(JSON.stringify({ total: apps.length, ok, miss, missing }, null, 2));
await conn.end();
