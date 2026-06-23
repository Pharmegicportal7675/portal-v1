const path = require('path');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });
require('dotenv').config();

const DEFAULT_PASSWORD = process.env.CLIENT_IMPORT_DEFAULT_PASSWORD || 'Change@123';
const SALT_ROUNDS = 12;

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

function buildSheet2Records(filePath) {
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
      idx: idx + 1,
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
  if (!inputPath) throw new Error('Usage: node scripts/reimport-sheet2-only.js "<excel-path>"');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE;
  if (!supabaseUrl || !serviceRole) throw new Error('Missing Supabase env vars.');

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const records = buildSheet2Records(inputPath);
  const { data: existingUsers } = await supabase.from('users').select('id, email');
  const usedEmails = new Set((existingUsers || []).map((u) => String(u.email).toLowerCase()));

  // Cleanup previously imported temporary records only.
  const { data: importClientIds } = await supabase
    .from('clients')
    .select('id')
    .ilike('email', '%@import.pharmegic.local');
  const ids = (importClientIds || []).map((row) => row.id);
  if (ids.length > 0) {
    await supabase.from('users').delete().in('client_id', ids);
    await supabase.from('users').delete().ilike('email', '%@import.pharmegic.local');
    await supabase.from('clients').delete().in('id', ids);
  }

  const { data: existingClientsAfterCleanup } = await supabase.from('clients').select('id, company_name, email');
  const existingClientByKey = new Map(
    (existingClientsAfterCleanup || []).map((c) => [normalizeName(c.company_name), c])
  );

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of records) {
    const key = normalizeName(row.company_name);
    if (existingClientByKey.has(key)) {
      skipped += 1;
      continue;
    }

    let email = `${slugify(row.company_name)}.${row.idx}@import.pharmegic.local`;
    let n = 1;
    while (usedEmails.has(email)) {
      email = `${slugify(row.company_name)}.${row.idx}.${n}@import.pharmegic.local`;
      n += 1;
    }

    const password_hash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);
    const clientPayload = {
      company_name: row.company_name,
      legal_name: null,
      registration_number: null,
      uuid_number: `IMP-${String(row.idx).padStart(4, '0')}-${slugify(row.company_name).toUpperCase().slice(0, 24)}`,
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

    const { data: client, error: cErr } = await supabase
      .from('clients')
      .insert(clientPayload)
      .select('id, company_name, email')
      .single();
    if (cErr || !client) {
      failed += 1;
      continue;
    }

    const { error: uErr } = await supabase.from('users').insert({
      email,
      password_hash,
      login_password: DEFAULT_PASSWORD,
      role: 'CLIENT',
      client_id: client.id,
      is_disabled: false,
    });
    if (uErr) {
      await supabase.from('clients').delete().eq('id', client.id);
      failed += 1;
      continue;
    }

    usedEmails.add(email);
    created += 1;
  }

  console.log('cleanup_deleted_import_clients', ids.length);
  console.log('sheet2_unique_companies', records.length);
  console.log('created_clients', created);
  console.log('skipped_existing_manual', skipped);
  console.log('failed', failed);
  console.log('default_password', DEFAULT_PASSWORD);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
