import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mariadb from 'mariadb';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://portal.pharmegichealthcare.com';

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

function publicPath(url) {
  if (!url?.trim()) return null;
  const trimmed = url.trim();
  const marker = '/uploads/certificates/';
  const idx = trimmed.indexOf(marker);
  if (idx >= 0) return trimmed.slice(idx).split('?')[0];
  if (trimmed.startsWith('/uploads/')) return trimmed.split('?')[0];
  try {
    return new URL(trimmed).pathname;
  } catch {
    return null;
  }
}

async function headOk(publicUrlPath) {
  if (!publicUrlPath) return { ok: false, status: 0 };
  try {
    const res = await fetch(`${ORIGIN}${publicUrlPath}`, {
      method: 'HEAD',
      cache: 'no-store',
    });
    return { ok: res.status === 200, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

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
  `SELECT a.id, a.status, a.bo_attachment_url, a.bo_attachment_name,
          a.created_at, c.company_name,
          cert.certificate_number, cert.file_url AS tcc_file_url
   FROM tcc_applications a
   LEFT JOIN clients c ON c.id = a.client_id
   LEFT JOIN certificates cert ON cert.tcc_application_id = a.id
   ORDER BY a.created_at DESC`
);

let poOk = 0;
let poMiss = 0;
let poNoUrl = 0;
let tccOk = 0;
let tccMiss = 0;
let tccNoUrl = 0;
const poMissing = [];
const tccMissing = [];

for (const app of apps) {
  const poPath = publicPath(app.bo_attachment_url);
  if (!poPath) {
    poNoUrl += 1;
    poMissing.push({
      id: app.id,
      company: app.company_name,
      status: app.status,
      reason: 'no_url',
      cert: app.certificate_number,
    });
  } else {
    const check = await headOk(poPath);
    if (check.ok) poOk += 1;
    else {
      poMiss += 1;
      poMissing.push({
        id: app.id,
        company: app.company_name,
        status: app.status,
        name: app.bo_attachment_name,
        path: poPath,
        http: check.status,
        cert: app.certificate_number,
        created: app.created_at,
      });
    }
  }

  const tccPath = publicPath(app.tcc_file_url);
  if (!tccPath) {
    tccNoUrl += 1;
    if (app.status === 'approved') {
      tccMissing.push({
        id: app.id,
        company: app.company_name,
        reason: 'no_url',
        cert: app.certificate_number,
      });
    }
  } else {
    const check = await headOk(tccPath);
    if (check.ok) tccOk += 1;
    else {
      tccMiss += 1;
      tccMissing.push({
        id: app.id,
        company: app.company_name,
        cert: app.certificate_number,
        path: tccPath,
        http: check.status,
      });
    }
  }
}

console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      origin: ORIGIN,
      apps: apps.length,
      po: { ok: poOk, missingFile: poMiss, noUrl: poNoUrl },
      tcc: { ok: tccOk, missingFile: tccMiss, noUrl: tccNoUrl },
      poMissing,
      tccMissing,
    },
    null,
    2
  )
);

await conn.end();
