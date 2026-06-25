import * as XLSX from 'xlsx';
import { parseFlexibleDateToIso } from '@/lib/parse-flexible-date';
import { REGULATORY_REGISTRATIONS, normalizeRegulatoryRegistrations, type RegulatoryRegistration } from '@/lib/regulatory-registrations';

export const CLIENT_IMPORT_DEFAULT_PASSWORD = 'Change@123';

const REG_MAP = new Map<string, RegulatoryRegistration>([
  ['eu reach', REGULATORY_REGISTRATIONS.EU_REACH],
  ['eu_reach', REGULATORY_REGISTRATIONS.EU_REACH],
  ['uk reach', REGULATORY_REGISTRATIONS.UK_REACH],
  ['uk_reach', REGULATORY_REGISTRATIONS.UK_REACH],
  ['turkey reach', REGULATORY_REGISTRATIONS.TURKEY_KKDIK],
  ['turkey reach (kkdik)', REGULATORY_REGISTRATIONS.TURKEY_KKDIK],
  ['turkey kkdik', REGULATORY_REGISTRATIONS.TURKEY_KKDIK],
  ['kkdik', REGULATORY_REGISTRATIONS.TURKEY_KKDIK],
  ['turkey_kkdik', REGULATORY_REGISTRATIONS.TURKEY_KKDIK],
]);

export type ParsedClientImportRow = {
  rowNumber: number;
  company_name: string;
  uuid_number: string;
  email: string;
  password: string;
  owner_name: string | null;
  phone: string | null;
  cc_emails: string | null;
  cc_phones: string | null;
  address: string;
  city: string;
  state: string;
  country: string;
  postal_code: string;
  status: 'active' | 'inactive' | 'pending';
  regulatory_registrations: RegulatoryRegistration[];
  primary_contact_first_name: string;
  primary_contact_last_name: string;
};

export type ParsedContactImportRow = {
  rowNumber: number;
  company_name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  role: string | null;
};

export type ParsedSubstanceImportRow = {
  rowNumber: number;
  company_name: string;
  chemical_name: string;
  cas_number: string;
  ec_number: string;
  tonnage_band: string | null;
  available_quantity: number;
  registration_number: string;
  issued_date: string;
  validity_date: string;
  status: 'active' | 'expired' | 'suspended';
};

export type ClientImportParseResult = {
  clients: ParsedClientImportRow[];
  contacts: ParsedContactImportRow[];
  substances: ParsedSubstanceImportRow[];
  skippedRows: { rowNumber: number; reason: string }[];
};

export const SUBSTANCE_IMPORT_DEFAULTS = {
  registration_number: 'TEST-REG',
  issued_date: '2026-01-01',
  validity_date: '2026-12-31',
  available_quantity: 0,
} as const;

export function normalizeCasNumber(value: string): string {
  return String(value || '')
    .trim()
    .replace(/\.$/, '')
    .replace(/\s+/g, '');
}

function parseTonnageBand(value: string): string | null {
  const trimmed = String(value || '').trim();
  if (!trimmed || trimmed.toLowerCase() === 'none') return null;
  return trimmed;
}

function parseLinkStatus(value: string): 'active' | 'expired' | 'suspended' {
  const status = String(value || 'active').trim().toLowerCase();
  if (status === 'active' || status === 'expired' || status === 'suspended') return status;
  return 'active';
}

function parseQuantity(value: string, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeKey(key: string): string {
  return String(key || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, ' ');
}

function buildHeaderMap(row: Record<string, unknown>): Map<string, string> {
  const map = new Map<string, string>();
  for (const key of Object.keys(row)) {
    map.set(normalizeKey(key), key);
  }
  return map;
}

function pick(
  row: Record<string, unknown>,
  headerMap: Map<string, string>,
  aliases: string[],
  fallback = ''
): string {
  for (const alias of aliases) {
    const actual = headerMap.get(normalizeKey(alias));
    if (actual == null || row[actual] == null) continue;
    if (typeof row[actual] === 'boolean') return row[actual] ? 'true' : 'false';
    if (String(row[actual]).trim() !== '') {
      return String(row[actual]).trim();
    }
  }
  return fallback;
}

function parseBooleanCell(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value == null) return false;
  const normalized = String(value).trim().toLowerCase();
  return ['true', 'yes', 'y', '1'].includes(normalized);
}

export function parseRegistrationsFromRow(
  row: Record<string, unknown>,
  headerMap: Map<string, string>
): RegulatoryRegistration[] {
  const hasBooleanColumns =
    headerMap.has('eu reach') ||
    headerMap.has('uk reach') ||
    headerMap.has('turkey reach (kkdik)');

  if (hasBooleanColumns) {
    const parsed: RegulatoryRegistration[] = [];
    if (parseBooleanCell(pick(row, headerMap, ['EU REACH', 'eu reach']))) {
      parsed.push(REGULATORY_REGISTRATIONS.EU_REACH);
    }
    if (parseBooleanCell(pick(row, headerMap, ['UK REACH', 'uk reach']))) {
      parsed.push(REGULATORY_REGISTRATIONS.UK_REACH);
    }
    if (
      parseBooleanCell(
        pick(row, headerMap, ['TURKEY REACH (KKDIK)', 'Turkey REACH (KKDIK)', 'turkey reach (kkdik)'])
      )
    ) {
      parsed.push(REGULATORY_REGISTRATIONS.TURKEY_KKDIK);
    }
    return parsed.length > 0 ? parsed : [REGULATORY_REGISTRATIONS.EU_REACH];
  }

  return parseRegistrations(
    pick(row, headerMap, ['Regulatory Registrations', 'regulatory_registrations'])
  );
}

export function parseRegistrations(value: string): RegulatoryRegistration[] {
  if (!value) return [REGULATORY_REGISTRATIONS.EU_REACH];
  const parts = String(value)
    .split(/[,;|]/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  const parsed: RegulatoryRegistration[] = [];
  for (const part of parts) {
    const mapped = REG_MAP.get(part);
    if (mapped && !parsed.includes(mapped)) parsed.push(mapped);
  }
  return parsed.length > 0 ? parsed : [REGULATORY_REGISTRATIONS.EU_REACH];
}

function parseStatus(value: string): 'active' | 'inactive' | 'pending' {
  const status = String(value || 'active').trim().toLowerCase();
  if (status === 'active' || status === 'inactive' || status === 'pending') return status;
  return 'active';
}

function splitContactName(firstName: string, lastName: string, fullName: string) {
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

function rowToClient(
  row: Record<string, unknown>,
  headerMap: Map<string, string>,
  rowNumber: number,
  defaultPassword: string
): ParsedClientImportRow | null {
  const recordType = pick(row, headerMap, ['Record Type', 'record type']);
  if (recordType && recordType.toLowerCase() !== 'client') return null;

  const companyName = pick(row, headerMap, ['Company Name', 'company_name', 'Company']);
  const email = pick(row, headerMap, ['Login Email', 'Email', 'email']).toLowerCase();
  const uuidNumber = pick(row, headerMap, ['UUID Number', 'uuid_number', 'UUID']);

  if (!companyName || !email) return null;

  const firstName = pick(row, headerMap, ['Primary Contact First Name', 'First Name']);
  const lastName = pick(row, headerMap, ['Primary Contact Last Name', 'Last Name']);
  const fullName = pick(row, headerMap, ['Primary Contact Name', 'Contact Name', 'Owner Name']);
  const contact = splitContactName(firstName, lastName, fullName);

  return {
    rowNumber,
    company_name: companyName,
    uuid_number: uuidNumber,
    email,
    password: pick(row, headerMap, ['Password', 'Login Password'], defaultPassword),
    owner_name: pick(row, headerMap, ['Owner Name', 'owner_name'], '') || null,
    phone: pick(row, headerMap, ['Phone', 'phone'], '') || null,
    cc_emails: pick(row, headerMap, ['CC Emails', 'cc_emails'], '') || null,
    cc_phones: pick(row, headerMap, ['CC Phones', 'cc_phones'], '') || null,
    address: pick(row, headerMap, ['Address', 'address'], '') || '—',
    city: pick(row, headerMap, ['City', 'city'], ''),
    state: pick(row, headerMap, ['State', 'state'], ''),
    country: pick(row, headerMap, ['Country', 'country'], 'India'),
    postal_code: pick(row, headerMap, ['Postal Code', 'postal_code'], '') || '—',
    status: parseStatus(pick(row, headerMap, ['Status', 'status'])),
    regulatory_registrations: parseRegistrationsFromRow(row, headerMap),
    primary_contact_first_name: contact.first_name,
    primary_contact_last_name: contact.last_name,
  };
}

function parseImportDateField(value: unknown, fallback: string): string {
  if (value == null || String(value).trim() === '') return fallback;
  return parseFlexibleDateToIso(value) ?? fallback;
}

function rowToSubstance(
  row: Record<string, unknown>,
  headerMap: Map<string, string>,
  rowNumber: number
): ParsedSubstanceImportRow | null {
  const recordType = pick(row, headerMap, ['Record Type', 'record type']).toLowerCase();
  if (recordType && recordType !== 'authorized chemical' && recordType !== 'authorized substance') return null;

  const companyName = pick(row, headerMap, [
    'Company Name',
    'Client name',
    'Client Name',
    'company_name',
    'Company',
  ]);
  const chemicalName = pick(row, headerMap, [
    'Chemical Name',
    'Substance',
    'Substance name',
    'Substance Name',
    'chemical_name',
  ]);
  const casNumber = normalizeCasNumber(
    pick(row, headerMap, ['CAS Number', 'CAS NO.', 'CAS NO. ', 'CAS', 'cas_number'])
  );

  if (!companyName || !chemicalName || !casNumber) return null;

  return {
    rowNumber,
    company_name: companyName,
    chemical_name: chemicalName,
    cas_number: casNumber,
    ec_number: pick(row, headerMap, ['EC Number', 'EC ', 'EC', 'ec_number'], '—'),
    tonnage_band: parseTonnageBand(pick(row, headerMap, ['Tonnage Band', 'tonnage_band'])),
    available_quantity: parseQuantity(
      pick(row, headerMap, ['Available Quantity (MT)', 'Available Quantity', 'available_quantity']),
      SUBSTANCE_IMPORT_DEFAULTS.available_quantity
    ),
    registration_number:
      pick(row, headerMap, ['Registration Number', 'registration_number']) ||
      SUBSTANCE_IMPORT_DEFAULTS.registration_number,
    issued_date: parseImportDateField(
      pick(row, headerMap, ['Issued Date', 'issued_date']),
      SUBSTANCE_IMPORT_DEFAULTS.issued_date
    ),
    validity_date: parseImportDateField(
      pick(row, headerMap, ['Validity Date', 'Validity / Expires Date', 'validity_date']),
      SUBSTANCE_IMPORT_DEFAULTS.validity_date
    ),
    status: parseLinkStatus(pick(row, headerMap, ['Status', 'status'])),
  };
}

function rowToContact(
  row: Record<string, unknown>,
  headerMap: Map<string, string>,
  rowNumber: number
): ParsedContactImportRow | null {
  const recordType = pick(row, headerMap, ['Record Type', 'record type']).toLowerCase();
  if (
    recordType &&
    recordType !== 'contact' &&
    recordType !== 'secondary person contact' &&
    recordType !== 'secondary contact'
  ) {
    return null;
  }

  const companyName = pick(row, headerMap, ['Company Name', 'company_name', 'Company']);
  const firstName = pick(row, headerMap, [
    'First Name',
    'Secondary Contact First Name',
    'Secondary Person First Name',
    'first_name',
  ]);
  const lastName = pick(row, headerMap, [
    'Last Name',
    'Secondary Contact Last Name',
    'Secondary Person Last Name',
    'last_name',
  ]);
  const email = pick(row, headerMap, ['Email', 'Secondary Contact Email', 'email']).toLowerCase();

  if (!companyName || !firstName || !lastName || !email) return null;

  return {
    rowNumber,
    company_name: companyName,
    first_name: firstName,
    last_name: lastName,
    email,
    phone:
      pick(row, headerMap, ['Phone', 'Secondary Contact Phone', 'Mobile Number', 'phone'], '') ||
      null,
    role:
      pick(row, headerMap, ['Role', 'Position / Role', 'Position', 'role'], '') || null,
  };
}

export function parseSpreadsheetBuffer(
  buffer: ArrayBuffer,
  defaultPassword = CLIENT_IMPORT_DEFAULT_PASSWORD
): ClientImportParseResult {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('The file does not contain any worksheets.');
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
    defval: '',
  });

  if (rows.length === 0) {
    throw new Error('The file is empty.');
  }

  const headerMap = buildHeaderMap(rows[0]);
  const hasRecordType = headerMap.has('record type');

  const clients: ParsedClientImportRow[] = [];
  const contacts: ParsedContactImportRow[] = [];
  const substances: ParsedSubstanceImportRow[] = [];
  const skippedRows: { rowNumber: number; reason: string }[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const recordType = pick(row, headerMap, ['Record Type', 'record type']).toLowerCase();

    if (hasRecordType && recordType) {
      if (
        recordType !== 'client' &&
        recordType !== 'contact' &&
        recordType !== 'secondary person contact' &&
        recordType !== 'secondary contact' &&
        recordType !== 'authorized chemical' &&
        recordType !== 'authorized substance'
      ) {
        return;
      }
    }

    const contact = rowToContact(row, headerMap, rowNumber);
    if (contact) {
      contacts.push(contact);
      return;
    }

    const substance = rowToSubstance(row, headerMap, rowNumber);
    if (substance) {
      substances.push(substance);
      return;
    }

    const client = rowToClient(row, headerMap, rowNumber, defaultPassword);
    if (client) {
      clients.push(client);
      return;
    }

    const companyName = pick(row, headerMap, ['Company Name', 'company_name', 'Company', 'Client name']);
    const email = pick(row, headerMap, ['Login Email', 'Email', 'email']);
    const casNumber = pick(row, headerMap, ['CAS Number', 'CAS NO.', 'CAS']);
    if (companyName && casNumber) {
      skippedRows.push({
        rowNumber,
        reason: 'Missing substance fields (Substance Name and valid CAS are required).',
      });
      return;
    }
    if (companyName || email) {
      skippedRows.push({
        rowNumber,
        reason: 'Missing required fields (Company Name and Email are required for clients).',
      });
    }
  });

  return { clients, contacts, substances, skippedRows };
}

export const IMPORT_TEMPLATE_SHEET_NAME = 'Client Import';

export function toImportDateValue(value: string | null | undefined): string {
  if (!value) return '';
  const iso = parseFlexibleDateToIso(value);
  if (iso) return iso;
  const datePart = String(value).trim().split('T')[0];
  return datePart || '';
}

export function formatTonnageBandForExport(value: string | null | undefined): string {
  if (!value || !String(value).trim()) return 'None';
  return String(value).trim();
}

export function buildReachBooleanColumns(registrations: unknown): {
  'EU REACH': boolean;
  'UK REACH': boolean;
  'TURKEY REACH (KKDIK)': boolean;
} {
  const values = normalizeRegulatoryRegistrations(registrations);
  return {
    'EU REACH': values.includes(REGULATORY_REGISTRATIONS.EU_REACH),
    'UK REACH': values.includes(REGULATORY_REGISTRATIONS.UK_REACH),
    'TURKEY REACH (KKDIK)': values.includes(REGULATORY_REGISTRATIONS.TURKEY_KKDIK),
  };
}

const IMPORT_RECORD_TYPE_ORDER = ['Client', 'Contact', 'Authorized Substance'] as const;

type ImportCompatibleRow = Record<string, string | number | boolean | null | undefined>;

export function mergeImportCompatibleRows(groups: {
  recordType: (typeof IMPORT_RECORD_TYPE_ORDER)[number];
  rows: ImportCompatibleRow[];
}[]): ImportCompatibleRow[] {
  const merged: ImportCompatibleRow[] = groups.flatMap((group) =>
    group.rows.map((row) => ({ 'Record Type': group.recordType, ...row }))
  );

  merged.sort((a, b) => {
    const companyCompare = String(a['Company Name'] ?? '').localeCompare(
      String(b['Company Name'] ?? ''),
      undefined,
      { sensitivity: 'base' }
    );
    if (companyCompare !== 0) return companyCompare;

    const typeCompare =
      IMPORT_RECORD_TYPE_ORDER.indexOf(a['Record Type'] as (typeof IMPORT_RECORD_TYPE_ORDER)[number]) -
      IMPORT_RECORD_TYPE_ORDER.indexOf(b['Record Type'] as (typeof IMPORT_RECORD_TYPE_ORDER)[number]);
    if (typeCompare !== 0) return typeCompare;

    return String(a['Substance Name'] ?? a['Chemical Name'] ?? a['Email'] ?? a['First Name'] ?? '').localeCompare(
      String(b['Substance Name'] ?? b['Chemical Name'] ?? b['Email'] ?? b['First Name'] ?? ''),
      undefined,
      { sensitivity: 'base' }
    );
  });

  const columnKeys = new Set<string>();
  merged.forEach((row) => {
    Object.keys(row).forEach((key) => columnKeys.add(key));
  });

  const preferredOrder = [
    'Record Type',
    'Company Name',
    'UUID Number',
    'Email',
    'Primary Contact First Name',
    'Primary Contact Last Name',
    'Password',
    'Phone',
    'Owner Name',
    'Address',
    'City',
    'State',
    'Country',
    'Postal Code',
    'Status',
    'EU REACH',
    'UK REACH',
    'TURKEY REACH (KKDIK)',
    'First Name',
    'Last Name',
    'Position / Role',
    'Substance Name',
    'CAS Number',
    'EC Number',
    'Tonnage Band',
    'Available Quantity (MT)',
    'Registration Number',
    'Issued Date',
    'Validity Date',
  ];

  const orderedColumns = [
    ...preferredOrder.filter((key) => columnKeys.has(key)),
    ...[...columnKeys].filter((key) => !preferredOrder.includes(key)).sort(),
  ];

  return merged.map((row) => {
    const normalized: ImportCompatibleRow = {};
    orderedColumns.forEach((key) => {
      normalized[key] = row[key] ?? '';
    });
    return normalized;
  });
}

export function buildClientImportTemplateBuffer(): ArrayBuffer {
  const rows = [
    {
      'Record Type': 'Client',
      'Company Name': 'Example Pharma Ltd',
      'UUID Number': 'EXAMPLE-UUID-001',
      Email: 'contact@example.com',
      'Primary Contact First Name': 'John',
      'Primary Contact Last Name': 'Doe',
      Password: CLIENT_IMPORT_DEFAULT_PASSWORD,
      Phone: '+91 9876543210',
      'Owner Name': 'John Doe',
      Address: '123 Industrial Area',
      City: 'Vapi',
      State: 'Gujarat',
      Country: 'India',
      'Postal Code': '396191',
      Status: 'active',
      'EU REACH': true,
      'UK REACH': false,
      'TURKEY REACH (KKDIK)': false,
    },
    {
      'Record Type': 'Contact',
      'Company Name': 'Example Pharma Ltd',
      'First Name': 'Jane',
      'Last Name': 'Smith',
      Email: 'jane.smith@example.com',
      Phone: '+91 9876543211',
      'Position / Role': 'Compliance Officer',
    },
    {
      'Record Type': 'Authorized Substance',
      'Company Name': 'Example Pharma Ltd',
      'Substance Name': 'Ethylenediamine',
      'CAS Number': '107-15-3',
      'EC Number': '203-468-6',
      'Tonnage Band': 'None',
      'Available Quantity (MT)': 0,
      'Registration Number': SUBSTANCE_IMPORT_DEFAULTS.registration_number,
      'Issued Date': SUBSTANCE_IMPORT_DEFAULTS.issued_date,
      'Validity Date': SUBSTANCE_IMPORT_DEFAULTS.validity_date,
      Status: 'active',
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, IMPORT_TEMPLATE_SHEET_NAME);
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}
