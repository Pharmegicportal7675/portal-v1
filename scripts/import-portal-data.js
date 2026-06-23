/**
 * One-time import for "portal data.xlsx" format.
 *
 * Sheet2: Company Name, Person, Contact Number -> clients + users
 * Sheet1: Client name, CAS, EC, Substance, Tonnage Band -> chemicals + client_chemicals
 *
 * Usage:
 *   node scripts/import-portal-data.js "path/to/portal data.xlsx"
 *   node scripts/import-portal-data.js "path/to/portal data.xlsx" --dry-run
 */

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });
require('dotenv').config();

const SALT_ROUNDS = 12;
const DEFAULT_PASSWORD = process.env.CLIENT_IMPORT_DEFAULT_PASSWORD || 'Change@123';
const DEFAULT_VALIDITY = '2026-12-31';

const NAME_ALIASES = new Map([
  ['balaji specilaity chemicals limited', 'balaji specialities'],
  ['balaji amines limited', 'balaji amines'],
  ['color india', 'colour india'],
  ['devpharma chem', 'dev pharma'],
  ['green paradise llp submitted for name update in echa 16 01', 'greenparadise'],
  ['navpad pigments', 'navpad pigment private limited'],
  ['oc specialities private limited', 'oc speciality'],
  ['riverside industries pvt limited', 'riverside industries private limited'],
  ['farg onaazot', 'farg onzzaot'],
  ['ami phthalo pigments', 'ami phthalo'],
  ['avdhoot pigments private limited', 'avdhoot'],
  ['bhabani colors private limited', 'bhabani colors'],
  ['chemcon specility chemicals limited', 'chemcon'],
  ['fairchem organics limited', 'fairchem organics'],
]);

function normalizeCompanyName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(private|limited|ltd|llp|pvt|inc|co)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(name) {
  return normalizeCompanyName(name).replace(/\s+/g, '-').slice(0, 40) || 'client';
}

function splitPerson(person) {
  const raw = String(person || '').trim();
  if (!raw) return { first_name: 'Contact', last_name: 'Person' };
  const firstPart = raw.split(/[&/]/)[0].trim();
  const parts = firstPart.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first_name: parts[0], last_name: '-' };
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
}

function formatPhone(value) {
  const phone = String(value ?? '').trim();
  return phone || null;
}

function normalizeCas(value) {
  return String(value || '').trim();
}

function normalizeTonnage(value) {
  const band = String(value || '').trim();
  if (!band) return '—';
  return band.replace(/\s+/g, '');
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE are required in .env.local');
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function readWorkbook(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheet1 = XLSX.utils.sheet_to_json(workbook.Sheets['Sheet1'] || workbook.Sheets[workbook.SheetNames[0]], {
    defval: '',
  });
  const sheet2 = XLSX.utils.sheet_to_json(workbook.Sheets['Sheet2'] || workbook.Sheets[workbook.SheetNames[1]] || {}, {
    defval: '',
  });
  return { sheet1, sheet2 };
}

function buildClientRecords(sheet1, sheet2) {
  const records = new Map();

  for (const [index, row] of sheet2.entries()) {
    const companyName = String(row['Company Name '] || row['Company Name'] || '').trim();
    if (!companyName) continue;
    const key = normalizeCompanyName(companyName);
    records.set(key, {
      company_name: companyName,
      owner_name: String(row.Person || '').trim() || null,
      phone: formatPhone(row['Contact Number']),
      ...splitPerson(row.Person),
      source: 'sheet2',
      index: index + 1,
    });
  }

  const sheet1Names = new Set(
    sheet1
      .map((row) => String(row['Client name '] || row['Client name'] || '').trim())
      .filter(Boolean)
  );

  for (const companyName of sheet1Names) {
    const key = normalizeCompanyName(companyName);
    if (records.has(key)) continue;
    records.set(key, {
      company_name: companyName,
      owner_name: null,
      phone: null,
      first_name: 'Contact',
      last_name: 'Person',
      source: 'sheet1',
      index: records.size + 1,
    });
  }

  return [...records.values()];
}

function resolveClientKey(name, clientKeyToId) {
  const norm = normalizeCompanyName(name);
  if (!norm) return null;
  if (clientKeyToId.has(norm)) return norm;

  const alias = NAME_ALIASES.get(norm);
  if (alias && clientKeyToId.has(alias)) return alias;

  for (const key of clientKeyToId.keys()) {
    if (key.includes(norm) || norm.includes(key)) return key;
  }

  for (const [from, to] of NAME_ALIASES.entries()) {
    if (from === norm || norm.includes(from) || from.includes(norm)) {
      if (clientKeyToId.has(to)) return to;
    }
  }

  return null;
}

async function loadExistingClients(adminSupabase) {
  const { data, error } = await adminSupabase
    .from('clients')
    .select('id, company_name, email');
  if (error) throw error;

  const byKey = new Map();
  const byEmail = new Set();
  for (const client of data || []) {
    byKey.set(normalizeCompanyName(client.company_name), client);
    byEmail.add(String(client.email).toLowerCase());
  }
  return { byKey, byEmail };
}

async function loadExistingChemicals(adminSupabase) {
  const { data, error } = await adminSupabase.from('chemicals').select('id, cas_number, chemical_name');
  if (error) throw error;
  const byCas = new Map();
  for (const chemical of data || []) {
    byCas.set(normalizeCas(chemical.cas_number), chemical);
  }
  return byCas;
}

async function createClientRecord(adminSupabase, record, usedEmails, dryRun) {
  const existingKey = normalizeCompanyName(record.company_name);
  const emailBase = `${slugify(record.company_name)}.${record.index}`;
  let email = `${emailBase}@import.pharmegic.local`;
  let suffix = 1;
  while (usedEmails.has(email)) {
    email = `${emailBase}.${suffix}@import.pharmegic.local`;
    suffix += 1;
  }

  const payload = {
    company_name: record.company_name,
    legal_name: null,
    registration_number: null,
    uuid_number: `IMP-${String(record.index).padStart(4, '0')}-${slugify(record.company_name).toUpperCase().slice(0, 24)}`,
    owner_name: record.owner_name,
    email,
    phone: record.phone,
    primary_contact_first_name: record.first_name,
    primary_contact_last_name: record.last_name,
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

  if (dryRun) {
    usedEmails.add(email);
    return { status: 'created', client: { id: `dry-${record.index}`, ...payload } };
  }

  const password_hash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);
  const { data: client, error: clientError } = await adminSupabase
    .from('clients')
    .insert(payload)
    .select('id, company_name, email')
    .single();

  if (clientError || !client) {
    return { status: 'failed', reason: clientError?.message || 'Client insert failed' };
  }

  const { error: userError } = await adminSupabase.from('users').insert({
    email: client.email,
    password_hash,
    login_password: DEFAULT_PASSWORD,
    role: 'CLIENT',
    client_id: client.id,
    is_disabled: false,
  });

  if (userError) {
    await adminSupabase.from('clients').delete().eq('id', client.id);
    return { status: 'failed', reason: userError.message };
  }

  usedEmails.add(client.email);
  return { status: 'created', client };
}

async function ensureChemical(adminSupabase, row, chemicalByCas, dryRun) {
  const cas = normalizeCas(row['CAS NO. '] || row['CAS NO.']);
  const name = String(row['Substance '] || row.Substance || '').trim();
  const ec = String(row['EC '] || row.EC || '').trim() || null;
  const tonnage = normalizeTonnage(row['Tonneage Band'] || row['Tonnage Band']);

  if (!cas || !name) return { status: 'skipped', reason: 'Missing CAS or substance name' };

  const existing = chemicalByCas.get(cas);
  if (existing) return { status: 'exists', chemical: existing };

  const payload = {
    chemical_name: name,
    cas_number: cas,
    ec_number: ec,
    tonnage_band: tonnage,
    available_quantity: 0,
    exported_quantity: 0,
    validity_date: DEFAULT_VALIDITY,
    status: 'active',
  };

  if (dryRun) {
    const fake = { id: `dry-chem-${cas}`, ...payload };
    chemicalByCas.set(cas, fake);
    return { status: 'created', chemical: fake };
  }

  const { data, error } = await adminSupabase.from('chemicals').insert(payload).select('id, cas_number, chemical_name').single();
  if (error || !data) {
    if (error?.code === '23505') {
      const { data: again } = await adminSupabase.from('chemicals').select('id, cas_number, chemical_name').eq('cas_number', cas).single();
      if (again) {
        chemicalByCas.set(cas, again);
        return { status: 'exists', chemical: again };
      }
    }
    return { status: 'failed', reason: error?.message || 'Chemical insert failed' };
  }

  chemicalByCas.set(cas, data);
  return { status: 'created', chemical: data };
}

async function ensureClientChemical(adminSupabase, clientId, chemicalId, dryRun) {
  if (dryRun) return { status: 'created' };

  const { data: existing } = await adminSupabase
    .from('client_chemicals')
    .select('id')
    .eq('client_id', clientId)
    .eq('chemical_id', chemicalId)
    .maybeSingle();

  if (existing) return { status: 'exists' };

  const { error } = await adminSupabase.from('client_chemicals').insert({
    client_id: clientId,
    chemical_id: chemicalId,
    available_quantity: 0,
    validity_date: DEFAULT_VALIDITY,
    status: 'active',
  });

  if (error) return { status: 'failed', reason: error.message };
  return { status: 'created' };
}

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== '--dry-run');
  const dryRun = process.argv.includes('--dry-run');
  const filePath = path.resolve(args[0] || path.join(process.cwd(), 'data', 'portal-data.xlsx'));

  if (!fs.existsSync(filePath)) {
    console.error(`Excel file not found: ${filePath}`);
    process.exit(1);
  }

  const { sheet1, sheet2 } = readWorkbook(filePath);
  const clientRecords = buildClientRecords(sheet1, sheet2);
  const adminSupabase = createAdminClient();
  const existingClients = await loadExistingClients(adminSupabase);
  const chemicalByCas = await loadExistingChemicals(adminSupabase);
  const usedEmails = new Set(existingClients.byEmail);
  const clientKeyToId = new Map();

  for (const [key, client] of existingClients.byKey.entries()) {
    clientKeyToId.set(key, client.id);
  }

  console.log(`File: ${filePath}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'IMPORT'}`);
  console.log(`Sheet2 rows: ${sheet2.length}, Sheet1 rows: ${sheet1.length}`);
  console.log(`Unique clients to process: ${clientRecords.length}`);
  console.log('--- CLIENTS ---');

  const clientSummary = { created: 0, skipped: 0, failed: 0 };

  for (const record of clientRecords) {
    const key = normalizeCompanyName(record.company_name);
    if (existingClients.byKey.has(key)) {
      clientSummary.skipped += 1;
      const existing = existingClients.byKey.get(key);
      clientKeyToId.set(key, existing.id);
      console.log(`[SKIP] ${record.company_name} — already exists`);
      continue;
    }

    const result = await createClientRecord(adminSupabase, record, usedEmails, dryRun);
    if (result.status === 'created') {
      clientSummary.created += 1;
      clientKeyToId.set(key, result.client.id);
      console.log(`[CREATE] ${record.company_name} <${result.client.email}>`);
    } else {
      clientSummary.failed += 1;
      console.log(`[FAIL] ${record.company_name} — ${result.reason}`);
    }
  }

  console.log('--- CHEMICALS ---');
  const chemSummary = { created: 0, exists: 0, skipped: 0, failed: 0 };

  for (const row of sheet1) {
    const result = await ensureChemical(adminSupabase, row, chemicalByCas, dryRun);
    chemSummary[result.status] = (chemSummary[result.status] || 0) + 1;
    if (result.status === 'created') {
      console.log(`[CHEM] ${result.chemical.chemical_name} (${result.chemical.cas_number})`);
    }
  }

  console.log('--- CLIENT CHEMICAL LINKS ---');
  const linkSummary = { created: 0, exists: 0, skipped: 0, failed: 0, unmatched: 0 };

  for (const row of sheet1) {
    const clientName = String(row['Client name '] || row['Client name'] || '').trim();
    const cas = normalizeCas(row['CAS NO. '] || row['CAS NO.']);
    if (!clientName || !cas) {
      linkSummary.skipped += 1;
      continue;
    }

    const clientKey = resolveClientKey(clientName, clientKeyToId);
    const chemical = chemicalByCas.get(cas);
    if (!clientKey || !chemical) {
      linkSummary.unmatched += 1;
      console.log(`[UNMATCHED] ${clientName} + ${cas}`);
      continue;
    }

    const clientId = clientKeyToId.get(clientKey);
    const link = await ensureClientChemical(adminSupabase, clientId, chemical.id, dryRun);
    linkSummary[link.status] = (linkSummary[link.status] || 0) + 1;
  }

  console.log('--- SUMMARY ---');
  console.log('Clients:', clientSummary);
  console.log('Chemicals:', chemSummary);
  console.log('Links:', linkSummary);
  if (!dryRun) {
    console.log(`Default client password: ${DEFAULT_PASSWORD}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
