const path = require('path');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');

require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });
require('dotenv').config();

const SALT_ROUNDS = 12;
const DEFAULT_PASSWORD = process.env.CLIENT_IMPORT_DEFAULT_PASSWORD || 'Change@123';

function normalizeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(private|limited|ltd|llp|pvt|inc|co)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value) {
  return normalizeName(value).replace(/\s+/g, '-').slice(0, 36) || 'client';
}

function splitPerson(person) {
  const raw = String(person || '').trim();
  if (!raw) return { first: 'Contact', last: 'Person' };
  const firstPart = raw.split(/[&/]/)[0].trim();
  const parts = firstPart.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first: parts[0], last: '-' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function loadSheet2Records(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames.includes('Sheet2') ? 'Sheet2' : workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

  const dedup = new Map();
  rows.forEach((row, idx) => {
    const company = String(row['Company Name '] || row['Company Name'] || '').trim();
    if (!company) return;
    const key = normalizeName(company);
    if (dedup.has(key)) return;

    const person = String(row['Person'] || '').trim();
    const contact = splitPerson(person);
    dedup.set(key, {
      sourceIndex: idx + 1,
      company_name: company,
      owner_name: person || null,
      phone: String(row['Contact Number'] || '').trim() || null,
      primary_contact_first_name: contact.first,
      primary_contact_last_name: contact.last,
    });
  });

  return [...dedup.values()];
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error('Usage: node scripts/add-missing-clients-from-portal-sheet2.js "<excel-path>"');
  }

  const { createAdminClient } = await import('./lib/db-client.mjs');
  const supabase = await createAdminClient();

  const sheet2Clients = loadSheet2Records(inputPath);
  const { data: existingClients, error: clientLoadErr } = await supabase
    .from('clients')
    .select('id, company_name, email');
  if (clientLoadErr) throw clientLoadErr;

  const { data: existingUsers, error: userLoadErr } = await supabase
    .from('users')
    .select('email');
  if (userLoadErr) throw userLoadErr;

  const existingByKey = new Map(
    (existingClients || []).map((client) => [normalizeName(client.company_name), client])
  );
  const usedEmails = new Set((existingUsers || []).map((row) => String(row.email).toLowerCase()));

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of sheet2Clients) {
    const key = normalizeName(row.company_name);
    if (existingByKey.has(key)) {
      skipped += 1;
      continue;
    }

    const base = `${slugify(row.company_name)}.${row.sourceIndex}`;
    let email = `${base}@import.pharmegic.local`;
    let suffix = 1;
    while (usedEmails.has(email)) {
      email = `${base}.${suffix}@import.pharmegic.local`;
      suffix += 1;
    }

    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);
    const payload = {
      company_name: row.company_name,
      legal_name: null,
      registration_number: null,
      uuid_number: `IMP-${String(row.sourceIndex).padStart(4, '0')}-${slugify(row.company_name)
        .toUpperCase()
        .slice(0, 24)}`,
      owner_name: row.owner_name,
      email,
      phone: row.phone,
      primary_contact_first_name: row.primary_contact_first_name,
      primary_contact_last_name: row.primary_contact_last_name,
      cc_emails: null,
      cc_phones: null,
      address: '—',
      city: '',
      state: '',
      country: 'India',
      postal_code: '—',
      status: 'active',
      regulatory_registrations: ['eu_reach'],
    };

    const { data: client, error: createClientErr } = await supabase
      .from('clients')
      .insert(payload)
      .select('id')
      .single();
    if (createClientErr || !client) {
      failed += 1;
      continue;
    }

    const { error: createUserErr } = await supabase.from('users').insert({
      email,
      password_hash: passwordHash,
      login_password: DEFAULT_PASSWORD,
      role: 'CLIENT',
      client_id: client.id,
      is_disabled: false,
    });

    if (createUserErr) {
      await supabase.from('clients').delete().eq('id', client.id);
      failed += 1;
      continue;
    }

    created += 1;
    usedEmails.add(email);
    existingByKey.set(key, { id: client.id, company_name: row.company_name, email });
  }

  console.log('sheet2_unique_companies', sheet2Clients.length);
  console.log('created_missing_clients', created);
  console.log('already_present_clients', skipped);
  console.log('failed', failed);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

