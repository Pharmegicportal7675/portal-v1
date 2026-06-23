import type { DbClient } from '@/lib/db/types';
import {
  getLastDateOfYear,
  getTodayDateString,
  isReachCertificateType,
  REACH_CERTIFICATE_TYPE,
} from '@/lib/reach-certificate';
import type { ReachPdfChemical, ReachPdfSource } from '@/lib/reach-pdf-data';
import type { ReachCertPdfInput } from '@/lib/reach-certificate-preview';

export type LoadedReachCertificateInput = ReachCertPdfInput & {
  certificateId?: string;
  clientId?: string;
  chemicalId?: string;
};

export async function loadReachCertificateInputByCertificateId(
  supabase: DbClient,
  certificateId: string
): Promise<LoadedReachCertificateInput | null> {
  const { data: cert, error } = await supabase
    .from('certificates')
    .select(
      `
      id,
      certificate_number,
      registration_number,
      tonnage_band,
      issued_at,
      expires_at,
      client_id,
      chemical_id,
      type,
      clients (
        id,
        company_name,
        uuid_number,
        address,
        city,
        state,
        postal_code,
        country
      ),
      chemicals (
        id,
        chemical_name,
        cas_number,
        ec_number,
        tonnage_band
      )
    `
    )
    .eq('id', certificateId)
    .single();

  if (error || !cert || !isReachCertificateType(cert)) return null;

  const client = unwrapRelation<ReachPdfSource>(cert.clients);
  const chemical = unwrapRelation<ReachPdfChemical>(cert.chemicals);
  if (!client || !chemical) return null;

  const issuedDate = cert.issued_at ? cert.issued_at.split('T')[0] : getTodayDateString();
  const validatedDate = cert.expires_at
    ? cert.expires_at.split('T')[0]
    : getLastDateOfYear();

  return {
    certificateId: cert.id,
    clientId: cert.client_id,
    chemicalId: cert.chemical_id,
    certificateNumber: cert.certificate_number,
    registrationNumber: cert.registration_number?.trim() || '—',
    issuedDate,
    validatedDate,
    client,
    chemical,
    tonnageBand: cert.tonnage_band,
  };
}

export async function loadReachCertificateInputByClientChemical(
  supabase: DbClient,
  params: {
    clientId: string;
    chemicalId: string;
    registrationNumber?: string | null;
    issuedDate?: string | null;
    validatedDate?: string | null;
    tonnageBand?: string | null;
  }
): Promise<LoadedReachCertificateInput | null> {
  const { clientId, chemicalId } = params;

  const [{ data: client }, { data: chemical }, { data: clientChem }, { data: existingCert }] =
    await Promise.all([
      supabase
        .from('clients')
        .select('id, company_name, uuid_number, address, city, state, postal_code, country')
        .eq('id', clientId)
        .single(),
      supabase
        .from('chemicals')
        .select('id, chemical_name, cas_number, ec_number, tonnage_band')
        .eq('id', chemicalId)
        .single(),
      supabase
        .from('client_chemicals')
        .select('id, validity_date, status')
        .eq('client_id', clientId)
        .eq('chemical_id', chemicalId)
        .eq('status', 'active')
        .maybeSingle(),
      supabase
        .from('certificates')
        .select('certificate_number, registration_number, issued_at, expires_at, tonnage_band')
        .eq('client_id', clientId)
        .eq('chemical_id', chemicalId)
        .eq('type', REACH_CERTIFICATE_TYPE)
        .order('issued_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (!client || !chemical || !clientChem) return null;

  const registrationNumber =
    params.registrationNumber?.trim() ||
    existingCert?.registration_number?.trim() ||
    '—';

  const issuedDate =
    params.issuedDate ||
    (existingCert?.issued_at ? existingCert.issued_at.split('T')[0] : getTodayDateString());

  const validatedDate =
    params.validatedDate ||
    (existingCert?.expires_at
      ? existingCert.expires_at.split('T')[0]
      : clientChem.validity_date?.split('T')[0] || getLastDateOfYear());

  const tonnageBand =
    params.tonnageBand !== undefined && params.tonnageBand !== null
      ? params.tonnageBand.trim() || null
      : existingCert?.tonnage_band ?? chemical.tonnage_band ?? null;

  const certNumber = existingCert?.certificate_number || `RC-preview-${chemicalId.slice(0, 8)}`;

  return {
    clientId,
    chemicalId,
    certificateNumber: certNumber,
    registrationNumber,
    issuedDate,
    validatedDate,
    client,
    chemical,
    tonnageBand,
  };
}

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export function parseReachTonnageBandParam(
  searchParams: URLSearchParams
): string | null | undefined {
  if (!searchParams.has('tonnageBand')) return undefined;
  const raw = searchParams.get('tonnageBand');
  return raw?.trim() ? raw.trim() : null;
}
