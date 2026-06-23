/**
 * One-time bulk import: Excel -> clients + users tables.
 *
 * Usage:
 *   node scripts/import-clients-from-excel.js path/to/clients.xlsx
 *   node scripts/import-clients-from-excel.js path/to/clients.xlsx --dry-run
 *
 * Default file path: data/clients-import.xlsx
 */

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');

require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });
require('dotenv').config();

const SALT_ROUNDS = 12;
const DEFAULT_PASSWORD = process.env.CLIENT_IMPORT_DEFAULT_PASSWORD || 'Change@123';
const DEFAULT_STATUS = 'active';

const REG_MAP = new Map([
  ['eu reach', 'eu_reach'],
  ['eu_reach', 'eu_reach'],
  ['uk reach', 'uk_reach'],
  ['uk_reach', 'uk_reach'],
  ['turkey reach', 'turkey_kkdik'],
  ['turkey reach (kkdik)', 'turkey_kkdik'],
  ['turkey kkdik', 'turkey_kkdik'],
  ['kkdik', 'turkey_kkdik'],
  ['turkey_kkdik', 'turkey_kkdik'],
]);

function normalizeKey(key) {
  return String(key || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, ' ');
}

function buildHeaderMap(row) {
  const map = new Map();
  for (const key of Object.keys(row)) {
    map.set(normalizeKey(key), key);
  }
  return map;
}

function pick(row, headerMap, aliases, fallback = '') {
  for (const alias of aliases) {
    const actual = headerMap.get(normalizeKey(alias));
    if (actual != null && row[actual] != null && String(row[actual]).trim() !== '') {
      return String(row[actual]).trim();
    }
  }
  return fallback;
}

function parseRegistrations(value) {
  if (!value) return ['eu_reach'];
  const parts = String(value)
    .split(/[,;|]/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  const parsed = [];
  for (const part of parts) {
    const mapped = REG_MAP.get(part);
    if (mapped && !parsed.includes(mapped)) parsed.push(mapped);
  }
  return parsed.length > 0 ? parsed : ['eu_reach'];
}

function parseStatus(value) {
  const status = String(value || DEFAULT_STATUS).trim().toLowerCase();
  if (status === 'active' || status === 'inactive' || status === 'pending') return status;
  return DEFAULT_STATUS;
}

function splitContactName(firstName, lastName, fullName) {
  if (firstName && lastName) {
    return { first_name: firstName, last_name: lastName };
  }
  if (fullName) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return { first_name: parts[0], last_name: '-' };
    return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
  }
  return { first_name: 'Primary', last_name: 'Contact' };
}

function rowToClient(row, headerMap) {
  const recordType = pick(row, headerMap, ['Record Type', 'record type']);
  if (recordType && recordType.toLowerCase() !== 'client') return null;

  const companyName = pick(row, headerMap, ['Company Name', 'company_name', 'Company']);
  const email = pick(row, headerMap, ['Email', 'Login Email', 'email']).toLowerCase();
  const uuidNumber = pick(row, headerMap, ['UUID Number', 'uuid_number', 'UUID']);

  if (!companyName || !email || !uuidNumber) return null;

  const firstName = pick(row, headerMap, ['Primary Contact First Name', 'First Name']);
  const lastName = pick(row, headerMap, ['Primary Contact Last Name', 'Last Name']);
  const fullName = pick(row, headerMap, ['Primary Contact Name', 'Contact Name', 'Owner Name']);
  const contact = splitContactName(firstName, lastName, fullName);

  return {
    company_name: companyName,
    uuid_number: uuidNumber,
    email,
    password: pick(row, headerMap, ['Password', 'Login Password'], DEFAULT_PASSWORD),
    owner_name: pick(row, headerMap, ['Owner Name', 'owner_name'], '') || null,
    phone: pick(row, headerMap, ['Phone', 'phone'], '') || null,
    cc_emails: pick(row, headerMap, ['CC Emails', 'cc_emails'], '') || null,
    cc_phones: pick(row, headerMap, ['CC Phones', 'cc_phones'], '') || null,
    address: pick(row, headerMap, ['Address', 'address'], '') || '—',
    city: pick(row, headerMap, ['City', 'city'], ''),
    state: pick(row, headerMap, ['State', 'state'], ''),
    country: pick(row, headerMap, ['Country', 'country'], 'Turkey'),
    postal_code: pick(row, headerMap, ['Postal Code', 'postal_code'], '') || '—',
    status: parseStatus(pick(row, headerMap, ['Status', 'status'])),
    regulatory_registrations: parseRegistrations(
      pick(row, headerMap, ['Regulatory Registrations', 'regulatory_registrations'])
    ),
    primary_contact_first_name: contact.first_name,
    primary_contact_last_name: contact.last_name,
  };
}

function readExcelRows(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  if (rows.length === 0) throw new Error('Excel sheet is empty.');
  const headerMap = buildHeaderMap(rows[0]);
  const clients = rows
    .map((row) => rowToClient(row, headerMap))
    .filter((row) => row != null);
  return { sheetName, clients };
}

async function createAdminClient() {
  const { createAdminClient: createDb } = await import('./lib/db-client.mjs');
  return createDb();
}

async function importClient(adminSupabase, client, dryRun) {
  const { data: existing } = await adminSupabase
    .from('clients')
    .select('id, company_name')
    .eq('email', client.email)
    .maybeSingle();

  if (existing) {
    return { status: 'skipped', reason: `Email already exists (${existing.company_name})` };
  }

  if (dryRun) {
    return { status: 'dry-run', reason: 'Would create client + login' };
  }

  const password_hash = await bcrypt.hash(client.password, SALT_ROUNDS);

  const { data: createdClient, error: clientError } = await adminSupabase
    .from('clients')
    .insert({
      company_name: client.company_name,
      legal_name: null,
      registration_number: null,
      uuid_number: client.uuid_number,
      owner_name: client.owner_name,
      email: client.email,
      phone: client.phone,
      primary_contact_first_name: client.primary_contact_first_name,
      primary_contact_last_name: client.primary_contact_last_name,
      cc_emails: client.cc_emails,
      cc_phones: client.cc_phones,
      address: client.address,
      city: client.city,
      state: client.state,
      country: client.country,
      postal_code: client.postal_code,
      status: client.status,
      regulatory_registrations: client.regulatory_registrations,
    })
    .select('id, company_name')
    .single();

  if (clientError || !createdClient) {
    return { status: 'failed', reason: clientError?.message || 'Client insert failed' };
  }

  const { error: userError } = await adminSupabase.from('users').insert({
    email: client.email,
    password_hash,
    login_password: client.password,
    role: 'CLIENT',
    client_id: createdClient.id,
    is_disabled: false,
  });

  if (userError) {
    await adminSupabase.from('clients').delete().eq('id', createdClient.id);
    return { status: 'failed', reason: userError.message };
  }

  return { status: 'created', reason: createdClient.id };
}

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== '--dry-run');
  const dryRun = process.argv.includes('--dry-run');
  const filePath = path.resolve(args[0] || path.join(process.cwd(), 'data', 'clients-import.xlsx'));

  if (!fs.existsSync(filePath)) {
    console.error(`Excel file not found: ${filePath}`);
    console.error('Place your file at data/clients-import.xlsx or pass the path as the first argument.');
    process.exit(1);
  }

  const { sheetName, clients } = readExcelRows(filePath);
  if (clients.length === 0) {
    console.error('No valid client rows found. Check required columns: Company Name, Email, UUID Number.');
    process.exit(1);
  }

  console.log(`File: ${filePath}`);
  console.log(`Sheet: ${sheetName}`);
  console.log(`Valid client rows: ${clients.length}`);
  console.log(dryRun ? 'Mode: DRY RUN (no database changes)' : 'Mode: IMPORT');
  console.log('---');

  const adminSupabase = await createAdminClient();
  const summary = { created: 0, skipped: 0, failed: 0 };

  for (const client of clients) {
    const result = await importClient(adminSupabase, client, dryRun);
    summary[result.status === 'dry-run' ? 'created' : result.status] =
      (summary[result.status === 'dry-run' ? 'created' : result.status] || 0) + 1;

    const label =
      result.status === 'created' || result.status === 'dry-run'
        ? result.status.toUpperCase()
        : result.status.toUpperCase();
    console.log(`[${label}] ${client.company_name} <${client.email}> — ${result.reason}`);
  }

  console.log('---');
  console.log(`Created: ${summary.created}`);
  console.log(`Skipped: ${summary.skipped}`);
  console.log(`Failed: ${summary.failed}`);

  if (!dryRun && summary.created > 0) {
    console.log(`Default password for new users (if column missing): ${DEFAULT_PASSWORD}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
