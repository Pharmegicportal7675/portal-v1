import type { SupabaseClient } from '@supabase/supabase-js';
import { hashPassword } from '@/lib/auth/password';
import { createReachCertificate } from '@/actions/reach';
import { getTonnageBandMaxQuota } from '@/lib/quota';
import { REACH_CERTIFICATE_TYPE } from '@/lib/reach-certificate';
import {
  CLIENT_IMPORT_DEFAULT_PASSWORD,
  type ParsedClientImportRow,
  type ParsedContactImportRow,
  type ParsedSubstanceImportRow,
} from '@/lib/client-directory-import';
import {
  normalizeRegulatoryRegistrations,
} from '@/lib/regulatory-registrations';

export type ClientImportRowResult = {
  company_name: string;
  email: string;
  status: 'created' | 'updated' | 'skipped' | 'failed';
  reason: string;
  client_id?: string | null;
};

export type ContactImportRowResult = {
  company_name: string;
  email: string;
  status: 'created' | 'updated' | 'skipped' | 'failed';
  reason: string;
};

export type SubstanceImportRowResult = {
  company_name: string;
  chemical_name: string;
  cas_number: string;
  status: 'created' | 'skipped' | 'failed' | 'updated';
  reason: string;
};

export type ClientDirectoryImportSummary = {
  clients: ClientImportRowResult[];
  contacts: ContactImportRowResult[];
  substances: SubstanceImportRowResult[];
  createdClients: number;
  updatedClients: number;
  skippedClients: number;
  failedClients: number;
  createdContacts: number;
  updatedContacts: number;
  skippedContacts: number;
  failedContacts: number;
  createdSubstances: number;
  skippedSubstances: number;
  failedSubstances: number;
  updatedSubstances: number;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

async function resolveUuidNumber(
  adminSupabase: SupabaseClient,
  client: ParsedClientImportRow,
  index: number
): Promise<string> {
  const trimmed = client.uuid_number.trim();
  if (trimmed) return trimmed;

  const base = `IMP-${slugify(client.company_name) || 'client'}-${index + 1}`;
  let candidate = base;
  let attempt = 0;

  while (attempt < 5) {
    const { data: existing } = await adminSupabase
      .from('clients')
      .select('id')
      .eq('uuid_number', candidate)
      .maybeSingle();

    if (!existing) return candidate;
    attempt += 1;
    candidate = `${base}-${attempt}`;
  }

  return `${base}-${Date.now()}`;
}

type ExistingClientRecord = {
  id: string;
  company_name: string;
  email: string;
  uuid_number: string | null;
  owner_name: string | null;
  phone: string | null;
  primary_contact_first_name: string | null;
  primary_contact_last_name: string | null;
  cc_emails: string | null;
  cc_phones: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  status: string | null;
  regulatory_registrations: unknown;
};

function registrationKey(value: unknown): string {
  return normalizeRegulatoryRegistrations(value).sort().join('|');
}

function buildClientUpdatePayload(
  client: ParsedClientImportRow,
  existing: ExistingClientRecord
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    company_name: client.company_name,
    owner_name: client.owner_name,
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
  };

  if (client.uuid_number.trim()) {
    payload.uuid_number = client.uuid_number.trim();
  }

  return payload;
}

function clientPayloadDiffers(
  client: ParsedClientImportRow,
  existing: ExistingClientRecord,
  payload: Record<string, unknown>
): boolean {
  const compare = (next: unknown, current: unknown) => String(next ?? '') !== String(current ?? '');

  if (compare(payload.company_name, existing.company_name)) return true;
  if (compare(payload.owner_name, existing.owner_name)) return true;
  if (compare(payload.phone, existing.phone)) return true;
  if (compare(payload.primary_contact_first_name, existing.primary_contact_first_name)) return true;
  if (compare(payload.primary_contact_last_name, existing.primary_contact_last_name)) return true;
  if (compare(payload.cc_emails, existing.cc_emails)) return true;
  if (compare(payload.cc_phones, existing.cc_phones)) return true;
  if (compare(payload.address, existing.address)) return true;
  if (compare(payload.city, existing.city)) return true;
  if (compare(payload.state, existing.state)) return true;
  if (compare(payload.country, existing.country)) return true;
  if (compare(payload.postal_code, existing.postal_code)) return true;
  if (compare(payload.status, existing.status)) return true;
  if (
    registrationKey(client.regulatory_registrations) !==
    registrationKey(existing.regulatory_registrations)
  ) {
    return true;
  }
  if (
    client.uuid_number.trim() &&
    compare(client.uuid_number.trim(), existing.uuid_number)
  ) {
    return true;
  }

  return false;
}

async function findExistingClient(
  adminSupabase: SupabaseClient,
  client: ParsedClientImportRow
): Promise<ExistingClientRecord | null> {
  const { data: byEmail } = await adminSupabase
    .from('clients')
    .select('*')
    .eq('email', client.email.toLowerCase())
    .maybeSingle();

  if (byEmail) return byEmail as ExistingClientRecord;

  const { data: byCompany } = await adminSupabase
    .from('clients')
    .select('*')
    .ilike('company_name', client.company_name.trim())
    .limit(1)
    .maybeSingle();

  return (byCompany as ExistingClientRecord | null) ?? null;
}

async function updateExistingClient(
  adminSupabase: SupabaseClient,
  existing: ExistingClientRecord,
  client: ParsedClientImportRow,
  dryRun: boolean
): Promise<ClientImportRowResult> {
  const base = {
    company_name: client.company_name,
    email: client.email,
    client_id: existing.id,
  };

  const payload = buildClientUpdatePayload(client, existing);
  const hasChanges = clientPayloadDiffers(client, existing, payload);

  if (!hasChanges) {
    return {
      ...base,
      status: 'skipped',
      reason: 'No changes detected for this client.',
    };
  }

  if (dryRun) {
    return {
      ...base,
      status: 'updated',
      reason: 'Ready to update existing client profile.',
    };
  }

  const { error } = await adminSupabase.from('clients').update(payload).eq('id', existing.id);
  if (error) {
    return {
      ...base,
      status: 'failed',
      reason: error.message,
    };
  }

  if (client.password.length >= 6) {
    const password_hash = await hashPassword(client.password);
    await adminSupabase
      .from('users')
      .update({
        password_hash,
        login_password: client.password,
      })
      .eq('client_id', existing.id);
  }

  return {
    ...base,
    status: 'updated',
    reason: 'Client profile updated from import file.',
  };
}

async function importClientRow(
  adminSupabase: SupabaseClient,
  client: ParsedClientImportRow,
  index: number,
  dryRun: boolean
): Promise<ClientImportRowResult> {
  const base = {
    company_name: client.company_name,
    email: client.email,
  };

  const existing = await findExistingClient(adminSupabase, client);

  if (existing) {
    return updateExistingClient(adminSupabase, existing, client, dryRun);
  }

  if (client.password.length < 6) {
    return {
      ...base,
      status: 'failed',
      reason: 'Password must be at least 6 characters.',
    };
  }

  const uuidNumber = await resolveUuidNumber(adminSupabase, client, index);

  if (dryRun) {
    return {
      ...base,
      status: 'created',
      reason: 'Ready to import.',
    };
  }

  const password_hash = await hashPassword(client.password);

  const { data: createdClient, error: clientError } = await adminSupabase
    .from('clients')
    .insert({
      company_name: client.company_name,
      legal_name: null,
      registration_number: null,
      uuid_number: uuidNumber,
      owner_name: client.owner_name,
      email: client.email.toLowerCase(),
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
    return {
      ...base,
      status: 'failed',
      reason: clientError?.message || 'Failed to create client.',
    };
  }

  const { error: userError } = await adminSupabase.from('users').insert({
    email: client.email.toLowerCase(),
    password_hash,
    login_password: client.password,
    role: 'CLIENT',
    client_id: createdClient.id,
    is_disabled: false,
  });

  if (userError) {
    await adminSupabase.from('clients').delete().eq('id', createdClient.id);
    return {
      ...base,
      status: 'failed',
      reason: userError.message,
    };
  }

  return {
    ...base,
    status: 'created',
    reason: 'Client created successfully.',
    client_id: createdClient.id,
  };
}

async function findClientIdByCompanyName(
  adminSupabase: SupabaseClient,
  companyName: string,
  cache: Map<string, string | null>
): Promise<string | null> {
  const key = companyName.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key) ?? null;

  const { data } = await adminSupabase
    .from('clients')
    .select('id, company_name')
    .ilike('company_name', companyName.trim())
    .limit(1)
    .maybeSingle();

  const clientId = data?.id ?? null;
  cache.set(key, clientId);
  return clientId;
}

async function resolveClientId(
  adminSupabase: SupabaseClient,
  companyName: string,
  clientCache: Map<string, string | null>,
  pendingClients: ParsedClientImportRow[],
  dryRun: boolean
): Promise<string | null> {
  const key = companyName.trim().toLowerCase();
  if (clientCache.has(key)) return clientCache.get(key) ?? null;

  const clientId = await findClientIdByCompanyName(adminSupabase, companyName, clientCache);
  if (clientId) return clientId;

  if (
    dryRun &&
    pendingClients.some((client) => client.company_name.trim().toLowerCase() === key)
  ) {
    return 'dry-run-client';
  }

  return null;
}

async function ensureChemicalId(
  adminSupabase: SupabaseClient,
  substance: ParsedSubstanceImportRow,
  dryRun: boolean
): Promise<string | null> {
  const { data: existingChem } = await adminSupabase
    .from('chemicals')
    .select('id')
    .eq('cas_number', substance.cas_number)
    .maybeSingle();

  if (existingChem?.id) {
    if (!dryRun) {
      await adminSupabase
        .from('chemicals')
        .update({
          chemical_name: substance.chemical_name,
          ec_number: substance.ec_number,
          tonnage_band: substance.tonnage_band,
        })
        .eq('id', existingChem.id);
    }
    return existingChem.id;
  }

  if (dryRun) return `dry-chem-${substance.cas_number}`;

  const { data: newChem, error } = await adminSupabase
    .from('chemicals')
    .insert({
      chemical_name: substance.chemical_name,
      cas_number: substance.cas_number,
      ec_number: substance.ec_number,
      tonnage_band: substance.tonnage_band,
      status: 'active',
    })
    .select('id')
    .single();

  if (error || !newChem) return null;
  return newChem.id;
}

async function hasActiveReachCertificate(
  adminSupabase: SupabaseClient,
  clientId: string,
  chemicalId: string
): Promise<boolean> {
  const { data } = await adminSupabase
    .from('certificates')
    .select('id')
    .eq('client_id', clientId)
    .eq('chemical_id', chemicalId)
    .eq('type', REACH_CERTIFICATE_TYPE)
    .neq('status', 'revoked')
    .limit(1)
    .maybeSingle();

  return Boolean(data?.id);
}

async function issueReachCertificateForImportedSubstance(
  adminSupabase: SupabaseClient,
  clientId: string,
  chemicalId: string,
  substance: ParsedSubstanceImportRow,
  userId: string,
  dryRun: boolean
): Promise<{ ok: true; issued: boolean } | { ok: false; reason: string }> {
  if (!substance.registration_number.trim() || !substance.issued_date || !substance.validity_date) {
    return { ok: false, reason: 'Registration number and validity dates are required to issue RC.' };
  }

  if (dryRun) return { ok: true, issued: true };

  const alreadyIssued = await hasActiveReachCertificate(adminSupabase, clientId, chemicalId);
  if (alreadyIssued) return { ok: true, issued: false };

  const bandMax = getTonnageBandMaxQuota(substance.tonnage_band);
  const allocated =
    substance.available_quantity > 0 ? substance.available_quantity : (bandMax ?? 0);

  const rcResult = await createReachCertificate({
    clientId,
    chemicalId,
    userId,
    registrationNumber: substance.registration_number.trim(),
    issuedDate: substance.issued_date,
    validatedDate: substance.validity_date,
    allocatedQuantity: allocated,
    tonnageBand: substance.tonnage_band,
  });

  if (!rcResult.success) {
    return { ok: false, reason: rcResult.error || 'Failed to issue RC certificate.' };
  }

  return { ok: true, issued: true };
}

async function importSubstanceRow(
  adminSupabase: SupabaseClient,
  substance: ParsedSubstanceImportRow,
  clientCache: Map<string, string | null>,
  pendingClients: ParsedClientImportRow[],
  dryRun: boolean,
  userId: string
): Promise<SubstanceImportRowResult> {
  const base = {
    company_name: substance.company_name,
    chemical_name: substance.chemical_name,
    cas_number: substance.cas_number,
  };

  const clientId = await resolveClientId(
    adminSupabase,
    substance.company_name,
    clientCache,
    pendingClients,
    dryRun
  );

  if (!clientId) {
    return {
      ...base,
      status: 'skipped',
      reason: 'Client not found for this company name.',
    };
  }

  const chemicalId = await ensureChemicalId(adminSupabase, substance, dryRun);
  if (!chemicalId) {
    return {
      ...base,
      status: 'failed',
      reason: 'Failed to create or resolve substance.',
    };
  }

  if (dryRun) {
    const issuePreview = await issueReachCertificateForImportedSubstance(
      adminSupabase,
      clientId,
      chemicalId,
      substance,
      userId,
      true
    );
    if (!issuePreview.ok) {
      return { ...base, status: 'failed', reason: issuePreview.reason };
    }
    return {
      ...base,
      status: 'created',
      reason: 'Ready to import (substance + RC certificate).',
    };
  }

  const { data: existingLink } = await adminSupabase
    .from('client_chemicals')
    .select('id, status, registration_number, issued_date, validity_date, available_quantity')
    .eq('client_id', clientId)
    .eq('chemical_id', chemicalId)
    .maybeSingle();

  const linkPayload = {
    available_quantity: substance.available_quantity,
    validity_date: substance.validity_date,
    registration_number: substance.registration_number,
    issued_date: substance.issued_date,
    status: substance.status,
  };

  if (existingLink) {
    if (existingLink.status === 'trashed') {
      const { error } = await adminSupabase
        .from('client_chemicals')
        .update({
          ...linkPayload,
          status: 'active',
        })
        .eq('id', existingLink.id);

      if (error) {
        return { ...base, status: 'failed', reason: error.message };
      }

      const issueResult = await issueReachCertificateForImportedSubstance(
        adminSupabase,
        clientId,
        chemicalId,
        substance,
        userId,
        false
      );
      if (!issueResult.ok) {
        return { ...base, status: 'failed', reason: issueResult.reason };
      }

      return {
        ...base,
        status: 'created',
        reason: 'Substance restored, assigned, and RC certificate issued.',
      };
    }

    const issueResult = await issueReachCertificateForImportedSubstance(
      adminSupabase,
      clientId,
      chemicalId,
      substance,
      userId,
      false
    );

    const patch: Record<string, unknown> = {};
    const compareField = (key: keyof typeof linkPayload, current: unknown) => {
      const next = linkPayload[key];
      const currentValue =
        key === 'available_quantity' ? Number(current ?? 0) : String(current ?? '').split('T')[0];
      const nextValue =
        key === 'available_quantity' ? Number(next ?? 0) : String(next ?? '').split('T')[0];
      if (currentValue !== nextValue) {
        patch[key] = next;
      }
    };

    compareField('registration_number', existingLink.registration_number);
    compareField('issued_date', existingLink.issued_date);
    compareField('validity_date', existingLink.validity_date);
    compareField('available_quantity', existingLink.available_quantity);
    compareField('status', existingLink.status);

    if (Object.keys(patch).length === 0) {
      if (!issueResult.ok) {
        return { ...base, status: 'failed', reason: issueResult.reason };
      }
      if (issueResult.issued) {
        return {
          ...base,
          status: 'updated',
          reason: 'RC certificate issued for existing substance assignment.',
        };
      }
      return {
        ...base,
        status: 'skipped',
        reason: 'Substance already assigned to this client.',
      };
    }

    const { error } = await adminSupabase.from('client_chemicals').update(patch).eq('id', existingLink.id);
    if (error) {
      return { ...base, status: 'failed', reason: error.message };
    }

    if (!issueResult.ok) {
      return { ...base, status: 'failed', reason: issueResult.reason };
    }

    return {
      ...base,
      status: 'updated',
      reason: issueResult.issued
        ? 'Existing substance link updated and RC certificate issued.'
        : 'Existing substance link updated with missing fields.',
    };
  }

  const { error } = await adminSupabase.from('client_chemicals').insert({
    client_id: clientId,
    chemical_id: chemicalId,
    ...linkPayload,
  });

  if (error) {
    return { ...base, status: 'failed', reason: error.message };
  }

  const issueResult = await issueReachCertificateForImportedSubstance(
    adminSupabase,
    clientId,
    chemicalId,
    substance,
    userId,
    false
  );

  if (!issueResult.ok) {
    await adminSupabase
      .from('client_chemicals')
      .update({ status: 'trashed' })
      .eq('client_id', clientId)
      .eq('chemical_id', chemicalId);
    return { ...base, status: 'failed', reason: issueResult.reason };
  }

  return {
    ...base,
    status: 'created',
    reason: 'Substance assigned and RC certificate issued.',
  };
}

async function importContactRow(
  adminSupabase: SupabaseClient,
  contact: ParsedContactImportRow,
  clientCache: Map<string, string | null>,
  pendingClients: ParsedClientImportRow[],
  dryRun: boolean
): Promise<ContactImportRowResult> {
  const base = {
    company_name: contact.company_name,
    email: contact.email,
  };

  const clientId = await resolveClientId(
    adminSupabase,
    contact.company_name,
    clientCache,
    pendingClients,
    dryRun
  );
  if (!clientId) {
    return {
      ...base,
      status: 'skipped',
      reason: 'Client not found for this company name.',
    };
  }

  const { data: existing } = await adminSupabase
    .from('client_contacts')
    .select('id, first_name, last_name, phone, role')
    .eq('client_id', clientId)
    .eq('email', contact.email.toLowerCase())
    .maybeSingle();

  if (existing) {
    const patch: Record<string, string | null> = {};
    if (existing.first_name !== contact.first_name) patch.first_name = contact.first_name;
    if (existing.last_name !== contact.last_name) patch.last_name = contact.last_name;
    if (String(existing.phone ?? '') !== String(contact.phone ?? '')) {
      patch.phone = contact.phone;
    }
    if (String(existing.role ?? '') !== String(contact.role ?? '')) {
      patch.role = contact.role;
    }

    if (Object.keys(patch).length === 0) {
      return {
        ...base,
        status: 'skipped',
        reason: 'No changes detected for this contact.',
      };
    }

    if (dryRun) {
      return {
        ...base,
        status: 'updated',
        reason: 'Ready to update existing contact.',
      };
    }

    const { error } = await adminSupabase
      .from('client_contacts')
      .update(patch)
      .eq('id', existing.id);

    if (error) {
      return {
        ...base,
        status: 'failed',
        reason: error.message,
      };
    }

    return {
      ...base,
      status: 'updated',
      reason: 'Contact updated from import file.',
    };
  }

  if (dryRun) {
    return {
      ...base,
      status: 'created',
      reason: 'Ready to import.',
    };
  }

  const { error } = await adminSupabase.from('client_contacts').insert({
    client_id: clientId,
    first_name: contact.first_name,
    last_name: contact.last_name,
    email: contact.email.toLowerCase(),
    phone: contact.phone,
    role: contact.role,
  });

  if (error) {
    return {
      ...base,
      status: 'failed',
      reason: error.message,
    };
  }

  return {
    ...base,
    status: 'created',
    reason: 'Contact created successfully.',
  };
}

export async function importClientDirectoryRows(
  adminSupabase: SupabaseClient,
  input: {
    clients: ParsedClientImportRow[];
    contacts: ParsedContactImportRow[];
    substances: ParsedSubstanceImportRow[];
    dryRun?: boolean;
    defaultPassword?: string;
    userId: string;
  }
): Promise<ClientDirectoryImportSummary> {
  const dryRun = input.dryRun ?? false;
  const defaultPassword = input.defaultPassword || CLIENT_IMPORT_DEFAULT_PASSWORD;

  const clientsWithPassword = input.clients.map((client) => ({
    ...client,
    password: client.password || defaultPassword,
  }));

  const clientCache = new Map<string, string | null>();
  const clientResults: ClientImportRowResult[] = [];
  for (const [index, client] of clientsWithPassword.entries()) {
    const result = await importClientRow(adminSupabase, client, index, dryRun);
    clientResults.push(result);

    const cacheKey = client.company_name.trim().toLowerCase();
    if (result.client_id) {
      clientCache.set(cacheKey, result.client_id);
    } else if ((result.status === 'created' || result.status === 'updated') && dryRun) {
      clientCache.set(cacheKey, 'dry-run-client');
    }
  }

  const contactResults: ContactImportRowResult[] = [];
  for (const contact of input.contacts) {
    contactResults.push(
      await importContactRow(adminSupabase, contact, clientCache, clientsWithPassword, dryRun)
    );
  }

  const substanceResults: SubstanceImportRowResult[] = [];
  for (const substance of input.substances) {
    substanceResults.push(
      await importSubstanceRow(
        adminSupabase,
        substance,
        clientCache,
        clientsWithPassword,
        dryRun,
        input.userId
      )
    );
  }

  const countByStatus = <T extends { status: string }>(rows: T[]) => ({
    created: rows.filter((row) => row.status === 'created').length,
    skipped: rows.filter((row) => row.status === 'skipped').length,
    failed: rows.filter((row) => row.status === 'failed').length,
    updated: rows.filter((row) => row.status === 'updated').length,
  });

  const clientCounts = countByStatus(clientResults);
  const contactCounts = countByStatus(contactResults);
  const substanceCounts = countByStatus(substanceResults);

  return {
    clients: clientResults,
    contacts: contactResults,
    substances: substanceResults,
    createdClients: clientCounts.created,
    updatedClients: clientCounts.updated,
    skippedClients: clientCounts.skipped,
    failedClients: clientCounts.failed,
    createdContacts: contactCounts.created,
    updatedContacts: contactCounts.updated,
    skippedContacts: contactCounts.skipped,
    failedContacts: contactCounts.failed,
    createdSubstances: substanceCounts.created,
    skippedSubstances: substanceCounts.skipped,
    failedSubstances: substanceCounts.failed,
    updatedSubstances: substanceCounts.updated,
  };
}
