import type { DbClient } from '@/lib/db/types';
import {
  buildReachBooleanColumns,
  formatTonnageBandForExport,
  IMPORT_TEMPLATE_SHEET_NAME,
  mergeImportCompatibleRows,
  toImportDateValue,
} from '@/lib/client-directory-import';
import { REACH_CERTIFICATE_TYPE } from '@/lib/reach-certificate';
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
      .select('client_id, chemical_id, tonnage_band, issued_at')
      .in('client_id', clientIds)
      .eq('type', REACH_CERTIFICATE_TYPE)
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

  const tonnageByClientChemical = new Map<string, string>();
  for (const cert of reachCerts || []) {
    const key = `${cert.client_id}:${cert.chemical_id}`;
    if (!tonnageByClientChemical.has(key) && cert.tonnage_band?.trim()) {
      tonnageByClientChemical.set(key, cert.tonnage_band.trim());
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

  const authorizedChemicalRows: ExportRow[] = (clientChemicals || []).map((row: any) => {
    const chemical = unwrapRelation(row.chemicals) as ChemicalRef | null;
    const tonnageKey = `${row.client_id}:${row.chemical_id}`;
    const tonnageBand = resolveDisplayedTonnageBand(
      tonnageByClientChemical.get(tonnageKey),
      chemical?.tonnage_band,
      ''
    );
    return {
      'Company Name': clientNameById.get(row.client_id) ?? '',
      'Substance Name': chemical?.chemical_name ?? '',
      'CAS Number': chemical?.cas_number ?? '',
      'EC Number': chemical?.ec_number ?? '',
      'Tonnage Band': formatTonnageBandForExport(tonnageBand),
      'Available Quantity (MT)': row.available_quantity ?? 0,
      'Registration Number': row.registration_number ?? '',
      'Issued Date': toImportDateValue(row.issued_date),
      'Validity Date': toImportDateValue(row.validity_date),
      Status: row.status ?? 'active',
    };
  });

  const allRows = mergeImportCompatibleRows([
    { recordType: 'Client', rows: clientRows },
    { recordType: 'Contact', rows: contactRows },
    { recordType: 'Authorized Substance', rows: authorizedChemicalRows },
  ]);

  const sheets: ExcelSheet[] = [{ name: IMPORT_TEMPLATE_SHEET_NAME, rows: allRows }];

  return buildExcelArrayBuffer(sheets);
}
