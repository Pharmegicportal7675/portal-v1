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

function jsonSafe(value) {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? Number(v) : v))
  );
}

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

async function head(pathOrUrl) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${ORIGIN}${pathOrUrl}`;
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return res.status;
  } catch {
    return 0;
  }
}

async function getJson(pathOrUrl, timeoutMs = 45000) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${ORIGIN}${pathOrUrl}`;
  const started = Date.now();
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    let body = text;
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 200);
    }
    return { status: res.status, ms: Date.now() - started, body };
  } catch (err) {
    return { status: 0, ms: Date.now() - started, body: String(err) };
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

const appCounts = await conn.query(
  `SELECT status, COUNT(*) AS n FROM tcc_applications GROUP BY status`
);
const poStats = await conn.query(
  `SELECT
     SUM(bo_attachment_url IS NOT NULL AND TRIM(bo_attachment_url) <> '') AS with_url,
     SUM(bo_attachment_url IS NULL OR TRIM(bo_attachment_url) = '') AS no_url,
     COUNT(*) AS total
   FROM tcc_applications`
);
const sharedPo = await conn.query(
  `SELECT bo_attachment_url, COUNT(*) AS n
   FROM tcc_applications
   WHERE bo_attachment_url IS NOT NULL AND TRIM(bo_attachment_url) <> ''
   GROUP BY bo_attachment_url
   HAVING COUNT(*) > 1
   ORDER BY n DESC
   LIMIT 10`
);
const certCounts = await conn.query(
  `SELECT type, status, COUNT(*) AS n FROM certificates GROUP BY type, status`
);
const approvedNoCert = await conn.query(
  `SELECT a.id, c.company_name
   FROM tcc_applications a
   LEFT JOIN clients c ON c.id = a.client_id
   LEFT JOIN certificates cert ON cert.tcc_application_id = a.id
   WHERE a.status = 'approved' AND cert.id IS NULL
   LIMIT 20`
);

const apps = await conn.query(
  `SELECT a.id, a.status, a.bo_attachment_url, a.bo_attachment_name, c.company_name,
          cert.certificate_number, cert.file_url
   FROM tcc_applications a
   LEFT JOIN clients c ON c.id = a.client_id
   LEFT JOIN certificates cert ON cert.tcc_application_id = a.id
   ORDER BY a.created_at DESC`
);

let poOk = 0;
let poMiss = 0;
let tccOk = 0;
let tccMiss = 0;
const poMissing = [];
const tccMissing = [];
for (const app of apps) {
  const po = publicPath(app.bo_attachment_url);
  if (!po) {
    poMiss += 1;
    poMissing.push({ company: app.company_name, reason: 'no_url', cert: app.certificate_number });
  } else {
    const st = await head(po);
    if (st === 200) poOk += 1;
    else {
      poMiss += 1;
      if (poMissing.length < 20) {
        poMissing.push({
          company: app.company_name,
          name: app.bo_attachment_name,
          cert: app.certificate_number,
          http: st,
        });
      }
    }
  }
  const tcc = publicPath(app.file_url);
  if (!tcc) {
    if (app.status === 'approved') {
      tccMiss += 1;
      tccMissing.push({ company: app.company_name, cert: app.certificate_number, reason: 'no_url' });
    }
  } else {
    const st = await head(tcc);
    if (st === 200) tccOk += 1;
    else {
      tccMiss += 1;
      if (tccMissing.length < 20) {
        tccMissing.push({
          company: app.company_name,
          cert: app.certificate_number,
          http: st,
        });
      }
    }
  }
}

const health = await getJson('/api/health', 15000);
const healthDb = await getJson('/api/health/db', 40000);
const login = await head('/login');
const client = await head('/client');
const approvals = await head('/admin/approvals');

console.log(
  JSON.stringify(
    jsonSafe({
      checkedAt: new Date().toISOString(),
      origin: ORIGIN,
      db: {
        appCounts,
        poStats,
        sharedPoCount: sharedPo.length,
        sharedPoTop: sharedPo.slice(0, 8),
        certCounts,
        approvedNoCert,
      },
      liveFiles: {
        apps: apps.length,
        poOk,
        poMiss,
        tccOk,
        tccMiss,
        poMissing,
        tccMissing,
      },
      endpoints: {
        health,
        healthDb,
        login,
        client,
        approvals,
      },
    }),
    null,
    2
  )
);

await conn.end();
