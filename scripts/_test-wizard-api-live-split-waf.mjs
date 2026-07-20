import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mariadb from 'mariadb';
import { SignJWT } from 'jose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const baseUrl = process.env.TEST_BASE_URL || 'https://portal.pharmegichealthcare.com';

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

const wrongSecret = new TextEncoder().encode('WRONG_AUTH_SECRET__for_local_test__do_not_change');
async function signSession(payload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(wrongSecret);
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

  const [admin] = await conn.query(
    `SELECT id, email, role, client_id
     FROM users
     WHERE role IN ('SUPER_ADMIN', 'MASTER_ADMIN') AND is_disabled = 0
     ORDER BY role = 'SUPER_ADMIN' DESC
     LIMIT 1`
  );

  const [client] = await conn.query(
    `SELECT id, company_name, uuid_number, primary_contact_first_name, primary_contact_last_name,
            email, owner_name, phone, address, city, state, country, postal_code, status,
            regulatory_registrations
     FROM clients
     ORDER BY updated_at DESC
     LIMIT 1`
  );

  await conn.end();

  if (!admin || !client) {
    console.error('No admin/client found');
    process.exit(1);
  }

  let registrations = [];
  try {
    registrations =
      typeof client.regulatory_registrations === 'string'
        ? JSON.parse(client.regulatory_registrations)
        : client.regulatory_registrations || [];
  } catch {
    registrations = ['EU REACH'];
  }
  if (!Array.isArray(registrations) || registrations.length === 0) registrations = ['EU REACH'];

  const token = await signSession({
    userId: admin.id,
    email: admin.email,
    role: admin.role,
    clientId: admin.client_id,
  });

  const profileFull = {
    company_name: client.company_name,
    uuid_number: client.uuid_number,
    primary_contact_first_name: client.primary_contact_first_name,
    primary_contact_last_name: client.primary_contact_last_name,
    email: client.email,
    owner_name: client.owner_name || '',
    phone: client.phone || '',
    address: client.address || '',
    city: client.city || '',
    state: client.state || '',
    country: client.country || 'India',
    postal_code: client.postal_code || '',
    status: client.status || 'active',
    regulatory_registrations: registrations,
  };

  console.log('Testing split against:', baseUrl);
  console.log('Client:', client.company_name, client.id);

  const profileStep1 = { ...profileFull };
  delete profileStep1.email;
  delete profileStep1.phone;
  delete profileStep1.owner_name;
  delete profileStep1.status;
  delete profileStep1.regulatory_registrations;

  const res1 = await fetch(`${baseUrl}/api/clients/wizard`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Cookie: `pharmegic_session=${token}`,
    },
    body: JSON.stringify({
      clientId: client.id,
      profile: profileStep1,
      // contacts intentionally omitted
    }),
  });
  const text1 = await res1.text();
  console.log('\n[Step 1: profile without email/phone]');
  console.log('status:', res1.status, 'content-type:', res1.headers.get('content-type'));
  console.log('body:', text1.slice(0, 120));

  const res2 = await fetch(`${baseUrl}/api/clients/wizard`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Cookie: `pharmegic_session=${token}`,
    },
    body: JSON.stringify({
      clientId: client.id,
      profile: {
        email: profileFull.email,
        phone: profileFull.phone,
        owner_name: profileFull.owner_name,
        status: profileFull.status,
        regulatory_registrations: profileFull.regulatory_registrations,
      },
      contacts: [],
    }),
  });
  const text2 = await res2.text();
  console.log('\n[Step 2: email/phone only + contacts=[]]');
  console.log('status:', res2.status, 'content-type:', res2.headers.get('content-type'));
  console.log('body:', text2.slice(0, 120));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

