import type { DbClient } from '@/lib/db/types';
import {
  buildReachBooleanColumns,
  formatTonnageBandForExport,
  IMPORT_TEMPLATE_SHEET_NAME,
  mergeImportCompatibleRows,
  normalizeCasNumber,
  toImportDateValue,
} from '@/lib/client-directory-import';
import {
  getReachCertificateYear,
  isReachCertificateType,
} from '@/lib/reach-certificate';
import { resolveDisplayedTonnageBand } from '@/lib/quota';
import { buildExcelArrayBuffer, type ExcelSheet } from '@/lib/export-excel';

type ExportRow = Record<string, string | number | boolean | null | undefined>;

type ChemicalRef = {
  chemical_name?: string | null;
  cas_number?: string | null;
  ec_number?: string | null;
  tonnage_band?: string | null;
};

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function buildClientDirectoryExportBuffer(
  supabase: DbClient,
  clientIds: string[]
): Promise<ArrayBuffer> {
  if (clientIds.length === 0) {
    throw new Error('No clients selected for export.');
  }

  const [
    { data: clients, error: clientsError },
    { data: contacts, error: contactsError },
    { data: clientChemicals, error: clientChemicalsError },
    { data: users, error: usersError },
    { data: reachCerts, error: reachCertsError },
  ] = await Promise.all([
    supabase.from('clients').select('*').in('id', clientIds).order('company_name', { ascending: true }),
    supabase.from('client_contacts').select('*').in('client_id', clientIds).order('created_at', { ascending: true }),
    supabase
      .from('client_chemicals')
      .select('*, chemicals(*)')
      .in('client_id', clientIds)
      .neq('status', 'trashed')
      .order('created_at', { ascending: true }),
    supabase.from('users').select('client_id, email, login_password').in('client_id', clientIds),
    supabase
      .from('certificates')
      .select(
        'client_id, chemical_id, registration_number, issued_at, expires_at, tonnage_band, allocated_quantity, status, type, certificate_number, chemicals(chemical_name, cas_number, ec_number, tonnage_band)'
      )
      .in('client_id', clientIds)
      .neq('status', 'revoked')
      .order('issued_at', { ascending: false }),
  ]);

  const queryError =
    clientsError || contactsError || clientChemicalsError || usersError || reachCertsError;
  if (queryError) {
    throw queryError;
  }

  const clientNameById = new Map(
    (clients || []).map((client: any) => [client.id as string, client.company_name as string])
  );
  const loginByClientId = new Map<string, any>(
    (users || []).map((user: any) => [user.client_id as string, user])
  );

  const reachCertificates = ((reachCerts || []) as any[]).filter(isReachCertificateType);

  // One export row per client + chemical + calendar year (newest cert wins if duplicates exist).
  const certRowByYearKey = new Map<string, any>();
  for (const cert of reachCertificates) {
    const year = getReachCertificateYear(cert.issued_at);
    if (year == null || !cert.chemical_id) continue;

    const chemical = unwrapRelation(cert.chemicals) as ChemicalRef | null;
    const cas = normalizeCasNumber(chemical?.cas_number || '').toLowerCase();
    const yearKey = `${cert.client_id}:${cert.chemical_id}:${cas}:${year}`;
    if (!certRowByYearKey.has(yearKey)) {
      certRowByYearKey.set(yearKey, cert);
    }
  }

  const clientRows: ExportRow[] = (clients || []).map((client: any) => {
    const login = loginByClientId.get(client.id);
    return {
      'Company Name': client.company_name ?? '',
      'UUID Number': client.uuid_number ?? '',
      Email: client.email ?? '',
      'Primary Contact First Name': client.primary_contact_first_name ?? '',
      'Primary Contact Last Name': client.primary_contact_last_name ?? '',
      Password: login?.login_password ?? '',
      Phone: client.phone ?? '',
      'Owner Name': client.owner_name ?? '',
      Address: client.address ?? '',
      City: client.city ?? '',
      State: client.state ?? '',
      Country: client.country ?? '',
      'Postal Code': client.postal_code ?? '',
      Status: client.status ?? '',
      ...buildReachBooleanColumns(client.regulatory_registrations),
    };
  });

  const contactRows: ExportRow[] = (contacts || []).map((contact: any) => ({
    'Company Name': clientNameById.get(contact.client_id) ?? '',
    'First Name': contact.first_name ?? '',
    'Last Name': contact.last_name ?? '',
    Email: contact.email ?? '',
    Phone: contact.phone ?? '',
    'Position / Role': contact.role ?? '',
  }));

  const authorizedChemicalRows: ExportRow[] = [];

  for (const cert of certRowByYearKey.values()) {
    const certRow = cert as {
      client_id: string;
      chemical_id: string;
      registration_number?: string | null;
      issued_at: string;
      expires_at?: string | null;
      tonnage_band?: string | null;
      allocated_quantity?: number | null;
      status?: string | null;
      chemicals?: ChemicalRef | ChemicalRef[] | null;
    };
    const chemical = unwrapRelation(certRow.chemicals);
    const tonnageBand = resolveDisplayedTonnageBand(
      certRow.tonnage_band,
      chemical?.tonnage_band,
      ''
    );
    authorizedChemicalRows.push({
      'Company Name': String(clientNameById.get(certRow.client_id) ?? ''),
      'Substance Name': chemical?.chemical_name ?? '',
      'CAS Number': chemical?.cas_number ?? '',
      'EC Number': chemical?.ec_number ?? '',
      'Tonnage Band': formatTonnageBandForExport(tonnageBand),
      'Available Quantity (MT)': certRow.allocated_quantity ?? 0,
      'Registration Number': certRow.registration_number ?? '',
      'Issued Date': toImportDateValue(certRow.issued_at),
      'Validity Date': toImportDateValue(certRow.expires_at),
      Status: certRow.status ?? 'active',
    });
  }

  const clientChemicalsWithCert = new Set(
    reachCertificates.map((cert: any) => `${cert.client_id}:${cert.chemical_id}`)
  );

  for (const row of clientChemicals || []) {
    const linkKey = `${row.client_id}:${row.chemical_id}`;
    if (clientChemicalsWithCert.has(linkKey)) continue;

    const chemical = unwrapRelation(row.chemicals) as ChemicalRef | null;
    const tonnageBand = resolveDisplayedTonnageBand(null, chemical?.tonnage_band, '');
    authorizedChemicalRows.push({
      'Company Name': String(clientNameById.get(row.client_id) ?? ''),
      'Substance Name': chemical?.chemical_name ?? '',
      'CAS Number': chemical?.cas_number ?? '',
      'EC Number': chemical?.ec_number ?? '',
      'Tonnage Band': formatTonnageBandForExport(tonnageBand),
      'Available Quantity (MT)': row.available_quantity ?? 0,
      'Registration Number': row.registration_number ?? '',
      'Issued Date': toImportDateValue(row.issued_date),
      'Validity Date': toImportDateValue(row.validity_date),
      Status: row.status ?? 'active',
    });
  }

  authorizedChemicalRows.sort((a, b) => {
    const companyCompare = String(a['Company Name']).localeCompare(String(b['Company Name']));
    if (companyCompare !== 0) return companyCompare;
    const substanceCompare = String(a['Substance Name']).localeCompare(String(b['Substance Name']));
    if (substanceCompare !== 0) return substanceCompare;
    return String(a['Issued Date']).localeCompare(String(b['Issued Date']));
  });

  const allRows = mergeImportCompatibleRows([
    { recordType: 'Client', rows: clientRows },
    { recordType: 'Contact', rows: contactRows },
    { recordType: 'Authorized Substance', rows: authorizedChemicalRows },
  ]);

  const sheets: ExcelSheet[] = [{ name: IMPORT_TEMPLATE_SHEET_NAME, rows: allRows }];

  return buildExcelArrayBuffer(sheets);
}
