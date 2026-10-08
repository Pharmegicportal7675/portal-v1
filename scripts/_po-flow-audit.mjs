/**
 * One-shot audit: every TCC application PO + file presence on live + local roots.
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

function toRelative(url) {
  if (!url?.trim()) return null;
  const trimmed = url.trim();
  const marker = '/uploads/certificates/';
  const idx = trimmed.indexOf(marker);
  if (idx >= 0) {
    try {
      return decodeURIComponent(trimmed.slice(idx + marker.length).split('?')[0]).replace(/^\/+/, '');
    } catch {
      return trimmed.slice(idx + marker.length).split('?')[0].replace(/^\/+/, '');
    }
  }
  if (trimmed.startsWith('/uploads/certificates/')) {
    return trimmed.slice('/uploads/certificates/'.length);
  }
  return null;
}

function localRoots() {
  const roots = [
    process.env.CERTIFICATES_UPLOAD_ROOT?.trim(),
    path.join(root, 'public', 'uploads', 'certificates'),
    path.join(root, '.next', 'standalone', 'public', 'uploads', 'certificates'),
    path.join(
      'D:',
      'home',
      'u402838766',
      'domains',
      'portal.pharmegichealthcare.com',
      'nodejs',
      'public',
      'uploads',
      'certificates'
    ),
  ].filter(Boolean);
  return [...new Set(roots.map((r) => path.resolve(r)))].filter((r) => {
    try {
      return fs.existsSync(r) && fs.statSync(r).isDirectory();
    } catch {
      return false;
    }
  });
}

function existsLocal(relative) {
  if (!relative) return false;
  const segments = relative.split('/').filter(Boolean);
  const fileName = segments[segments.length - 1] || '';
  const parent = segments.slice(0, -1);
  const variants = [fileName, fileName.replace(/[^a-zA-Z0-9._-]/g, '_')];
  for (const base of localRoots()) {
    for (const name of variants) {
      const full = path.join(base, ...parent, name);
      try {
        if (fs.existsSync(full) && fs.statSync(full).isFile()) return true;
      } catch {
        // next
      }
    }
  }
  return false;
}

async function existsLive(relative) {
  if (!relative) return { ok: false, status: 0 };
  const publicPath = `/uploads/certificates/${relative.split('/').map(encodeURIComponent).join('/')}`;
  try {
    const res = await fetch(`${ORIGIN}${publicPath}`, { method: 'HEAD', cache: 'no-store' });
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
          a.created_at, a.updated_at, c.company_name,
          cert.certificate_number, cert.file_url
   FROM tcc_applications a
   LEFT JOIN clients c ON c.id = a.client_id
   LEFT JOIN certificates cert ON cert.tcc_application_id = a.id
   ORDER BY a.created_at DESC`
);

const total = apps.length;
let withUrl = 0;
let noUrl = 0;
let liveOk = 0;
let liveMiss = 0;
let localOk = 0;
let localMiss = 0;
const byStatus = {};
const liveMissRows = [];
const noUrlRows = [];
const duplicateUrls = new Map();

for (const app of apps) {
  byStatus[app.status || 'null'] = (byStatus[app.status || 'null'] || 0) + 1;
  const relative = toRelative(app.bo_attachment_url);
  if (!relative) {
    noUrl += 1;
    noUrlRows.push({
      id: app.id,
      status: app.status,
      company: app.company_name,
      created: app.created_at,
    });
    continue;
  }
  withUrl += 1;
  duplicateUrls.set(relative, (duplicateUrls.get(relative) || 0) + 1);

  const local = existsLocal(relative);
  if (local) localOk += 1;
  else localMiss += 1;

  const live = await existsLive(relative);
  if (live.ok) liveOk += 1;
  else {
    liveMiss += 1;
    liveMissRows.push({
      id: app.id,
      status: app.status,
      company: app.company_name,
      name: app.bo_attachment_name,
      relative,
      cert: app.certificate_number,
      created: app.created_at,
      http: live.status,
    });
  }
}

const shared = [...duplicateUrls.entries()].filter(([, n]) => n > 1);

// Count PO files on local roots
const poFileCounts = {};
for (const base of localRoots()) {
  let count = 0;
  function walk(dir, depth) {
    if (depth > 8) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'PO' || e.name === 'bo') {
          try {
            count += fs.readdirSync(full).filter((n) => fs.statSync(path.join(full, n)).isFile()).length;
          } catch {
            // ignore
          }
        } else {
          walk(full, depth + 1);
        }
      }
    }
  }
  walk(base, 0);
  poFileCounts[base] = count;
}

// Sample recent 15 missing for report
const recentMiss = liveMissRows.slice(0, 15);
const recentOkCount = liveOk;

console.log(JSON.stringify({
  origin: ORIGIN,
  localRoots: localRoots(),
  poFileCounts,
  apps: {
    total,
    byStatus,
    withUrl,
    noUrl,
    liveOk,
    liveMiss,
    localOk,
    localMiss,
    sharedUrlCount: shared.length,
  },
  noUrlSample: noUrlRows.slice(0, 10),
  recentLiveMiss: recentMiss,
  sharedUrls: shared.slice(0, 10).map(([u, n]) => ({ url: u, apps: n })),
}, null, 2));

await conn.end();
