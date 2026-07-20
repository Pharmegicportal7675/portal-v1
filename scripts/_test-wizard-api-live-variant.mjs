import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mariadb from 'mariadb';
import { SignJWT } from 'jose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';
const variants = [
  { name: 'content-type=application/json', headers: { 'Content-Type': 'application/json' } },
  { name: 'content-type=text/plain', headers: { 'Content-Type': 'text/plain' } },
  { name: 'no-content-type-header', headers: {} },
  { name: 'application/json+origin+referer', headers: { 'Content-Type': 'application/json' } },
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

const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'pharmegic-fallback-secret-change-in-production'
);

async function signSession(payload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);
}

async function fetchWizard(body, cookie, variant, originUrl) {
  const headers = { ...variant.headers };
  if (cookie) headers.Cookie = `pharmegic_session=${cookie}`;
  if (variant.name === 'application/json+origin+referer') {
    headers.Origin = originUrl;
    headers.Referer = `${originUrl}/admin/clients/new`;
  }

  const res = await fetch(`${baseUrl}/api/clients/wizard`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // keep null
  }

  return {
    status: res.status,
    contentType: res.headers.get('content-type'),
    text: text.slice(0, 200),
    json,
  };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL missing');
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

  // Pick any SUPER_ADMIN/MASTER_ADMIN + any client (we won't successfully update).
  const [admin] = await conn.query(
    `SELECT id, email, role, client_id
     FROM users
     WHERE role IN ('SUPER_ADMIN', 'MASTER_ADMIN') AND is_disabled = 0
     ORDER BY role = 'SUPER_ADMIN' DESC
     LIMIT 1`
  );

  const [client] = await conn.query(
    `SELECT id, company_name
     FROM clients
     ORDER BY updated_at DESC
     LIMIT 1`
  );

  await conn.end();

  if (!admin || !client) {
    console.error('No admin/client found');
    process.exit(1);
  }

  console.log('Testing against:', baseUrl);
  console.log('Admin:', admin.email, admin.role);
  console.log('Client:', client.company_name, client.id);

  const token = await signSession({
    userId: admin.id,
    email: admin.email,
    role: admin.role,
    clientId: admin.client_id,
  });

  // Deliberately invalid payload so even if auth works, schema will fail early.
  // This should avoid real mutations on live.
  const body = {
    clientId: client.id,
    profile: {
      // missing required fields intentionally
      company_name: 'x',
      uuid_number: 'x',
    },
    contacts: [],
  };

  const originUrl = new URL(baseUrl).origin;

  for (const variant of variants) {
    const out = await fetchWizard(body, token, variant, originUrl);
    console.log(`\n[${variant.name}]`);
    console.log(' status:', out.status);
    console.log(' content-type:', out.contentType);
    console.log(' body:', out.json ?? out.text);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

