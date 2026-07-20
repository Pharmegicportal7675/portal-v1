import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mariadb from 'mariadb';
import { SignJWT } from 'jose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';

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

async function tryPost(body, token) {
  const res = await fetch(`${baseUrl}/api/clients/wizard`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Cookie: `pharmegic_session=${token}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // plain text
  }

  return {
    status: res.status,
    contentType: res.headers.get('content-type'),
    body: json ?? text.slice(0, 120),
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

  console.log('Testing against:', baseUrl);
  console.log('Admin:', admin.email, admin.role);
  console.log('Client:', client.company_name, client.id);

  const token = await signSession({
    userId: admin.id,
    email: admin.email,
    role: admin.role,
    clientId: admin.client_id,
  });

  const fullProfile = {
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

  const variants = [
    { name: 'FULL_PROFILE', profile: fullProfile },
    {
      name: 'FULL_PROFILE_NO_REGISTRATIONS_KEY',
      profile: {
        company_name: fullProfile.company_name,
        uuid_number: fullProfile.uuid_number,
        primary_contact_first_name: fullProfile.primary_contact_first_name,
        primary_contact_last_name: fullProfile.primary_contact_last_name,
        email: fullProfile.email,
        owner_name: fullProfile.owner_name,
        phone: fullProfile.phone,
        address: fullProfile.address,
        city: fullProfile.city,
        state: fullProfile.state,
        country: fullProfile.country,
        postal_code: fullProfile.postal_code,
        status: fullProfile.status,
        // no regulatory_registrations key
      },
    },
    {
      name: 'FULL_PROFILE_NO_STATUS_KEY',
      profile: {
        company_name: fullProfile.company_name,
        uuid_number: fullProfile.uuid_number,
        primary_contact_first_name: fullProfile.primary_contact_first_name,
        primary_contact_last_name: fullProfile.primary_contact_last_name,
        email: fullProfile.email,
        owner_name: fullProfile.owner_name,
        phone: fullProfile.phone,
        address: fullProfile.address,
        city: fullProfile.city,
        state: fullProfile.state,
        country: fullProfile.country,
        postal_code: fullProfile.postal_code,
        // no status key
        regulatory_registrations: fullProfile.regulatory_registrations,
      },
    },
    {
      name: 'FULL_PROFILE_MIN_VALUES',
      profile: {
        company_name: 'x',
        uuid_number: 'x',
        primary_contact_first_name: 'x',
        primary_contact_last_name: 'x',
        email: 'x@x.com',
        owner_name: 'x',
        phone: 'x',
        address: 'x',
        city: 'x',
        state: 'x',
        country: 'x',
        postal_code: 'x',
        status: 'active',
        regulatory_registrations: ['EU REACH'],
      },
    },
    {
      name: 'ONLY_PRIMARY_CONTACT',
      profile: {
        company_name: fullProfile.company_name,
        uuid_number: fullProfile.uuid_number,
        primary_contact_first_name: fullProfile.primary_contact_first_name,
        primary_contact_last_name: fullProfile.primary_contact_last_name,
      },
    },
    {
      name: 'PRIMARY_CONTACT_PLUS_EMAIL_ONLY',
      profile: {
        company_name: fullProfile.company_name,
        uuid_number: fullProfile.uuid_number,
        primary_contact_first_name: fullProfile.primary_contact_first_name,
        primary_contact_last_name: fullProfile.primary_contact_last_name,
        email: fullProfile.email,
      },
    },
    {
      name: 'PRIMARY_CONTACT_PLUS_ADDRESS_ONLY',
      profile: {
        company_name: fullProfile.company_name,
        uuid_number: fullProfile.uuid_number,
        primary_contact_first_name: fullProfile.primary_contact_first_name,
        primary_contact_last_name: fullProfile.primary_contact_last_name,
        address: fullProfile.address,
        city: fullProfile.city,
        state: fullProfile.state,
        country: fullProfile.country,
        postal_code: fullProfile.postal_code,
      },
    },
    {
      name: 'PRIMARY_CONTACT_PLUS_STATUS_ONLY',
      profile: {
        company_name: fullProfile.company_name,
        uuid_number: fullProfile.uuid_number,
        primary_contact_first_name: fullProfile.primary_contact_first_name,
        primary_contact_last_name: fullProfile.primary_contact_last_name,
        status: fullProfile.status,
      },
    },
    {
      name: 'PRIMARY_CONTACT_PLUS_PHONE_ONLY',
      profile: {
        company_name: fullProfile.company_name,
        uuid_number: fullProfile.uuid_number,
        primary_contact_first_name: fullProfile.primary_contact_first_name,
        primary_contact_last_name: fullProfile.primary_contact_last_name,
        phone: fullProfile.phone,
      },
    },
    {
      name: 'PRIMARY_CONTACT_PLUS_STATUS_AND_PHONE',
      profile: {
        company_name: fullProfile.company_name,
        uuid_number: fullProfile.uuid_number,
        primary_contact_first_name: fullProfile.primary_contact_first_name,
        primary_contact_last_name: fullProfile.primary_contact_last_name,
        status: fullProfile.status,
        phone: fullProfile.phone,
      },
    },
    {
      name: 'PRIMARY_CONTACT_PLUS_EMAIL_AND_PHONE_ONLY',
      profile: {
        company_name: fullProfile.company_name,
        uuid_number: fullProfile.uuid_number,
        primary_contact_first_name: fullProfile.primary_contact_first_name,
        primary_contact_last_name: fullProfile.primary_contact_last_name,
        email: fullProfile.email,
        phone: fullProfile.phone,
      },
    },
    {
      name: 'PRIMARY_CONTACT_PLUS_EMAIL_PHONE_AND_ADDRESS_ONLY',
      profile: {
        company_name: fullProfile.company_name,
        uuid_number: fullProfile.uuid_number,
        primary_contact_first_name: fullProfile.primary_contact_first_name,
        primary_contact_last_name: fullProfile.primary_contact_last_name,
        email: fullProfile.email,
        phone: fullProfile.phone,
        address: fullProfile.address,
        city: fullProfile.city,
        state: fullProfile.state,
        country: fullProfile.country,
        postal_code: fullProfile.postal_code,
      },
    },
    {
      name: 'PRIMARY_CONTACT_PLUS_EMAIL_PHONE_OWNER_AND_ADDRESS_ONLY',
      profile: {
        company_name: fullProfile.company_name,
        uuid_number: fullProfile.uuid_number,
        primary_contact_first_name: fullProfile.primary_contact_first_name,
        primary_contact_last_name: fullProfile.primary_contact_last_name,
        email: fullProfile.email,
        phone: fullProfile.phone,
        owner_name: fullProfile.owner_name,
        address: fullProfile.address,
        city: fullProfile.city,
        state: fullProfile.state,
        country: fullProfile.country,
        postal_code: fullProfile.postal_code,
      },
    },
    {
      name: 'PRIMARY_CONTACT_PLUS_OWNER_ONLY',
      profile: {
        company_name: fullProfile.company_name,
        uuid_number: fullProfile.uuid_number,
        primary_contact_first_name: fullProfile.primary_contact_first_name,
        primary_contact_last_name: fullProfile.primary_contact_last_name,
        owner_name: fullProfile.owner_name,
      },
    },
    {
      name: 'PRIMARY_CONTACT_PLUS_OWNER_AND_ADDRESS_ONLY',
      profile: {
        company_name: fullProfile.company_name,
        uuid_number: fullProfile.uuid_number,
        primary_contact_first_name: fullProfile.primary_contact_first_name,
        primary_contact_last_name: fullProfile.primary_contact_last_name,
        owner_name: fullProfile.owner_name,
        address: fullProfile.address,
        city: fullProfile.city,
        state: fullProfile.state,
        country: fullProfile.country,
        postal_code: fullProfile.postal_code,
      },
    },
    {
      name: 'PRIMARY_CONTACT_PLUS_STATUS_AND_ADDRESS_ONLY',
      profile: {
        company_name: fullProfile.company_name,
        uuid_number: fullProfile.uuid_number,
        primary_contact_first_name: fullProfile.primary_contact_first_name,
        primary_contact_last_name: fullProfile.primary_contact_last_name,
        status: fullProfile.status,
        address: fullProfile.address,
        city: fullProfile.city,
        state: fullProfile.state,
        country: fullProfile.country,
        postal_code: fullProfile.postal_code,
      },
    },
    {
      name: 'PRIMARY_CONTACT_PLUS_STATUS_AND_EMAIL_ONLY',
      profile: {
        company_name: fullProfile.company_name,
        uuid_number: fullProfile.uuid_number,
        primary_contact_first_name: fullProfile.primary_contact_first_name,
        primary_contact_last_name: fullProfile.primary_contact_last_name,
        status: fullProfile.status,
        email: fullProfile.email,
      },
    },
    {
      name: 'NO_PRIMARY_CONTACT_FIELDS',
      profile: {
        company_name: fullProfile.company_name,
        uuid_number: fullProfile.uuid_number,
        // Keep some other fields but remove the primary contact fields entirely.
        email: fullProfile.email,
        owner_name: fullProfile.owner_name,
        phone: fullProfile.phone,
        address: fullProfile.address,
        city: fullProfile.city,
        state: fullProfile.state,
        country: fullProfile.country,
        postal_code: fullProfile.postal_code,
        status: fullProfile.status,
        regulatory_registrations: fullProfile.regulatory_registrations,
      },
    },
    {
      name: 'NO_ADDRESS_FIELDS',
      profile: { ...fullProfile, address: '', city: '', state: '', postal_code: '' },
    },
    {
      name: 'NO_PHONE_EMAIL',
      profile: { ...fullProfile, phone: '', email: '' },
    },
    {
      name: 'NO_REGISTRATIONS',
      profile: { ...fullProfile, regulatory_registrations: [] },
    },
    {
      name: 'MINIMAL_CONTACTS_FIELD',
      profile: { company_name: fullProfile.company_name, uuid_number: fullProfile.uuid_number },
    },
  ];

  for (const v of variants) {
    const out = await tryPost(
      {
        clientId: client.id,
        profile: v.profile,
        contacts: [],
      },
      token
    );
    console.log(`\n[${v.name}]`);
    console.log(' status:', out.status);
    console.log(' content-type:', out.contentType);
    console.log(' body:', out.body);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

