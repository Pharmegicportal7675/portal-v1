/**
 * Import Sheet1 substances from portal data.xlsx:
 * Client name, CAS, EC, Substance, Tonnage Band -> chemicals + client_chemicals
 *
 * Does NOT create clients. Only links to existing clients in DB.
 *
 * Usage:
 *   node scripts/import-portal-sheet1-substances.js "path/to/portal data.xlsx"
 *   node scripts/import-portal-sheet1-substances.js "path/to/portal data.xlsx" --dry-run
 */

const path = require('path');
const XLSX = require('xlsx');

require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });
require('dotenv').config();

const DEFAULT_VALIDITY = '2026-12-31';
const DEFAULT_ISSUED_DATE = '2026-01-01';
const DEFAULT_REGISTRATION_NUMBER = 'TEST-REG';

const NAME_ALIASES = new Map([
  ['balaji specilaity chemicals limited', 'balaji specialities'],
  ['balaji amines limited', 'balaji amines'],
  ['color india', 'colour india'],
  ['devpharma chem', 'dev pharma'],
  ['green paradise llp submitted for name update in echa 16 01', 'greenparadise'],
  ['green paradise submitted for name update in echa 16 01', 'greenparadise'],
  ['navpad pigments', 'navpad pigment private limited'],
  ['oc specialities private limited', 'oc speciality'],
  ['riverside industries pvt limited', 'riverside industries private limited'],
  ['farg onaazot', 'farg onzzaot'],
  ['ami phthalo pigments', 'ami phthalo'],
  ['avdhoot pigments private limited', 'avdhoot'],
  ['bhabani colors private limited', 'bhabani colors'],
  ['chemcon specility chemicals limited', 'chemcon'],
  ['fairchem organics limited', 'fairchem organics'],
  ['ami pigments pvt ltd', 'ami pigments'],
  ['dynamic industries', 'dynamic industries'],
  ['misa finechem private limited', 'misa'],
  ['rustavi azot jsc', 'rustavi azot'],
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

function normalizeCas(value) {
  return String(value || '')
    .trim()
    .replace(/\.$/, '')
    .replace(/\s+/g, '');
}

function normalizeTonnage(value) {
  const band = String(value ?? '').trim();
  if (!band) return null;
  return band.replace(/\s+/g, '');
}

function getTonnageFromRow(row) {
  const val =
    row['Tonneage Band'] ??
    row['Tonnage Band'] ??
    row['tonnage_band'] ??
    row['Quota'] ??
    row['quota'];
  if (val == null || String(val).trim() === '') return null;
  return normalizeTonnage(val);
}

function loadSheet1(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames.includes('Sheet1') ? 'Sheet1' : workbook.SheetNames[0];
  const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

  let currentClient = '';
  return rawRows.map((row) => {
    const clientName = String(row['Client name '] || row['Client name'] || '').trim();
    if (clientName) currentClient = clientName;
    return {
      ...row,
      'Client name ': currentClient,
      'Client name': currentClient,
    };
  });
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

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--dry-run');
  const dryRun = process.argv.includes('--dry-run');
  const filePath = path.resolve(args[0] || path.join(process.cwd(), 'data', 'portal-data.xlsx'));

  const { createAdminClient } = await import('./lib/db-client.mjs');
  const adminSupabase = await createAdminClient();

  const sheet1 = loadSheet1(filePath);
  const { data: clients, error: clientErr } = await adminSupabase
    .from('clients')
    .select('id, company_name');
  if (clientErr) throw clientErr;

  const clientKeyToId = new Map();
  for (const client of clients || []) {
    clientKeyToId.set(normalizeCompanyName(client.company_name), client.id);
  }

  const { data: existingChemicals, error: chemErr } = await adminSupabase
    .from('chemicals')
    .select('id, cas_number, chemical_name, ec_number, tonnage_band');
  if (chemErr) throw chemErr;

  const chemicalByCas = new Map();
  for (const chem of existingChemicals || []) {
    chemicalByCas.set(normalizeCas(chem.cas_number), chem);
  }

  const chemSummary = { created: 0, exists: 0, updated: 0, skipped: 0, failed: 0 };
  const linkSummary = { created: 0, exists: 0, updated: 0, skipped: 0, failed: 0, unmatched: 0 };
  const unmatchedClients = new Set();

  async function ensureChemical(row) {
    const cas = normalizeCas(row['CAS NO. '] || row['CAS NO.']);
    const name = String(row['Substance '] || row.Substance || '').trim();
    const ec = String(row['EC '] || row.EC || '').trim() || '—';
    const tonnage = getTonnageFromRow(row);

    if (!cas || !name || cas === '-') {
      chemSummary.skipped += 1;
      return null;
    }

    const existing = chemicalByCas.get(cas);
    if (existing) {
      chemSummary.exists += 1;
      if (!dryRun) {
        const patch = {};
        if (ec && ec !== existing.ec_number) patch.ec_number = ec;
        // Excel has no quota/tonnage column — default to none (null).
        if (tonnage == null) {
          if (existing.tonnage_band != null) patch.tonnage_band = null;
        } else if (tonnage !== existing.tonnage_band) {
          patch.tonnage_band = tonnage;
        }
        if (Object.keys(patch).length > 0) {
          await adminSupabase.from('chemicals').update(patch).eq('id', existing.id);
          chemSummary.updated += 1;
        }
      }
      return existing;
    }

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
      const fake = { id: `dry-${cas}`, ...payload };
      chemicalByCas.set(cas, fake);
      chemSummary.created += 1;
      return fake;
    }

    const { data, error } = await adminSupabase
      .from('chemicals')
      .insert(payload)
      .select('id, cas_number, chemical_name')
      .single();

    if (error || !data) {
      if (error?.code === '23505') {
        const { data: again } = await adminSupabase
          .from('chemicals')
          .select('id, cas_number, chemical_name, ec_number, tonnage_band')
          .eq('cas_number', cas)
          .single();
        if (again) {
          chemicalByCas.set(cas, again);
          chemSummary.exists += 1;
          return again;
        }
      }
      chemSummary.failed += 1;
      return null;
    }

    chemicalByCas.set(cas, data);
    chemSummary.created += 1;
    return data;
  }

  async function ensureLink(clientId, chemicalId) {
    if (dryRun) {
      linkSummary.created += 1;
      return;
    }

    const { data: existing } = await adminSupabase
      .from('client_chemicals')
      .select('id, available_quantity, registration_number, issued_date, validity_date')
      .eq('client_id', clientId)
      .eq('chemical_id', chemicalId)
      .maybeSingle();

    const defaultLinkFields = {
      available_quantity: 0,
      validity_date: DEFAULT_VALIDITY,
      registration_number: DEFAULT_REGISTRATION_NUMBER,
      issued_date: DEFAULT_ISSUED_DATE,
      status: 'active',
    };

    if (existing) {
      const patch = {};
      if (Number(existing.available_quantity) !== 0) patch.available_quantity = 0;
      if (!existing.registration_number) patch.registration_number = DEFAULT_REGISTRATION_NUMBER;
      if (!existing.issued_date) patch.issued_date = DEFAULT_ISSUED_DATE;
      if (!existing.validity_date) patch.validity_date = DEFAULT_VALIDITY;

      if (Object.keys(patch).length > 0) {
        await adminSupabase.from('client_chemicals').update(patch).eq('id', existing.id);
        linkSummary.updated = (linkSummary.updated || 0) + 1;
      } else {
        linkSummary.exists += 1;
      }
      return;
    }

    const { error } = await adminSupabase.from('client_chemicals').insert({
      client_id: clientId,
      chemical_id: chemicalId,
      ...defaultLinkFields,
    });

    if (error) {
      linkSummary.failed += 1;
      return;
    }
    linkSummary.created += 1;
  }

  console.log(`File: ${filePath}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'IMPORT'}`);
  console.log(`Sheet1 rows: ${sheet1.length}`);
  console.log(`Existing clients in DB: ${clientKeyToId.size}`);
  console.log('---');

  for (const row of sheet1) {
    const chemical = await ensureChemical(row);
    if (!chemical) continue;

    const clientName = String(row['Client name '] || row['Client name'] || '').trim();
    if (!clientName) {
      linkSummary.skipped += 1;
      continue;
    }

    const clientKey = resolveClientKey(clientName, clientKeyToId);
    if (!clientKey) {
      linkSummary.unmatched += 1;
      unmatchedClients.add(clientName);
      continue;
    }

    const clientId = clientKeyToId.get(clientKey);
    await ensureLink(clientId, chemical.id);
  }

  console.log('Chemicals:', chemSummary);
  console.log('Client-chemical links:', linkSummary);
  if (unmatchedClients.size > 0) {
    console.log('Unmatched client names (' + unmatchedClients.size + '):');
    for (const name of [...unmatchedClients].sort()) {
      console.log('  -', name);
    }
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
