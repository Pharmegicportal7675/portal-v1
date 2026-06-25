import { cache } from 'react';
import { createAdminClient } from '@/lib/db/admin';
import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { getLatestReachCertForChemical, type ReachCertificateRecord } from '@/lib/reach-certificate';
import { enrichTccApplicationsWithRcQuota } from '@/services/db';

export const loadClientProfileData = cache(async function loadClientProfileData(clientId: string) {
  const session = await getSession();
  if (!session || (session.role !== 'MASTER_ADMIN' && session.role !== 'SUPER_ADMIN')) {
    redirect('/login');
  }

  const adminSupabase = createAdminClient();

  const { data: client, error: clientError } = await adminSupabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single();

  if (clientError || !client) {
    redirect('/admin/clients');
  }

  const [
    { data: user },
    { data: clientChemicals },
    { data: allChemicals },
    { data: contacts },
    { data: tccHistoryRaw },
    { data: certificates },
    { data: activityLogs },
    { data: internalNotesData },
    { data: adminSettings },
  ] = await Promise.all([
    adminSupabase.from('users').select('*').eq('client_id', clientId).maybeSingle(),
    adminSupabase.from('client_chemicals').select('*, chemicals(*)').eq('client_id', clientId),
    adminSupabase.from('chemicals').select('*').eq('status', 'active').order('chemical_name', { ascending: true }),
    adminSupabase.from('client_contacts').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
    adminSupabase
      .from('tcc_applications')
      .select('*, chemicals(*), certificates!certificates_tcc_application_id_fkey(*), client_chemicals(available_quantity, registration_number)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false }),
    adminSupabase
      .from('certificates')
      .select('*, chemicals(chemical_name, cas_number, ec_number, tonnage_band), tcc_applications!certificates_tcc_application_id_fkey(*, chemicals(*))')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false }),
    adminSupabase.from('activity_logs').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
    adminSupabase
      .from('internal_notes')
      .select('*, users!internal_notes_author_id_fkey(email)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false }),
    adminSupabase.from('admin_settings').select('smtp_from, smtp_cc_default').eq('id', 1).maybeSingle(),
  ]);

  const tccHistory = await enrichTccApplicationsWithRcQuota(
    adminSupabase,
    (tccHistoryRaw || []).map((row: { chemicals?: unknown; certificates?: unknown; client_chemicals?: unknown }) => ({
      ...row,
      chemicals: Array.isArray(row.chemicals) ? row.chemicals[0] : row.chemicals,
      certificates: Array.isArray(row.certificates) ? row.certificates[0] ?? null : row.certificates,
      client_chemicals: Array.isArray(row.client_chemicals) ? row.client_chemicals[0] ?? null : row.client_chemicals,
    }))
  );

  const internalNotes = (internalNotesData || []).map((note: { id: string; note: string; created_at: string; users?: { email?: string } | null }) => ({
    id: note.id,
    note: note.note,
    created_at: note.created_at,
    author_email: note.users?.email || 'System',
  }));

  const normalizedCertificates = (certificates || [])
    .filter((row: { status?: string | null }) => row.status !== 'revoked')
    .map((row: { chemicals?: unknown; tcc_applications?: unknown }) => ({
    ...row,
    chemicals: Array.isArray(row.chemicals) ? row.chemicals[0] : row.chemicals,
    tcc_applications: Array.isArray(row.tcc_applications)
      ? row.tcc_applications[0] ?? null
      : row.tcc_applications,
  }));

  const normalizedClientChemicals = (clientChemicals || []).map(
    (row: {
      chemical_id: string;
      registration_number?: string | null;
      certificate_number?: string | null;
      chemicals?: unknown;
    }) => {
      const chemicals = Array.isArray(row.chemicals) ? row.chemicals[0] : row.chemicals;
      const casNumber =
        chemicals && typeof chemicals === 'object' && 'cas_number' in chemicals
          ? (chemicals as { cas_number?: string | null }).cas_number
          : null;
      const latestCert = getLatestReachCertForChemical(
        normalizedCertificates as unknown as ReachCertificateRecord[],
        row.chemical_id,
        casNumber,
        row.registration_number,
        row.certificate_number
      );
      const resolvedCertNumber =
        latestCert?.certificate_number?.trim() || row.certificate_number?.trim() || null;

      return {
        ...row,
        chemicals,
        certificate_number: resolvedCertNumber,
      };
    }
  );

  return {
    session,
    client,
    user,
    clientChemicals: normalizedClientChemicals,
    allChemicals: allChemicals || [],
    contacts: contacts || [],
    tccHistory,
    certificates: normalizedCertificates,
    activityLogs: activityLogs || [],
    internalNotes,
    emailDefaults: {
      defaultCcEmails: adminSettings?.smtp_cc_default ?? null,
      senderEmail: adminSettings?.smtp_from ?? null,
      contactEmails: (contacts || [])
        .map((c: { email?: string }) => c.email)
        .filter((email: string | undefined): email is string => Boolean(email)),
    },
  };
});

export type ClientProfileData = Awaited<ReturnType<typeof loadClientProfileData>>;

export type ClientProfileViewMode = 'overview' | 'chemicals' | 'certificates' | 'rc-certificates';

export async function loadClientPortalData(clientId: string) {
  const adminSupabase = createAdminClient();

  const [
    { data: client, error: clientError },
    { data: user },
    { data: clientChemicals },
    { data: contacts },
    { data: tccHistoryRaw },
    { data: certificates },
    { data: activityLogs },
  ] = await Promise.all([
    adminSupabase.from('clients').select('*').eq('id', clientId).single(),
    adminSupabase.from('users').select('*').eq('client_id', clientId).maybeSingle(),
    adminSupabase.from('client_chemicals').select('*, chemicals(*)').eq('client_id', clientId),
    adminSupabase
      .from('client_contacts')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false }),
    adminSupabase
      .from('tcc_applications')
      .select('*, chemicals(*), certificates!certificates_tcc_application_id_fkey(*), client_chemicals(available_quantity, registration_number)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false }),
    adminSupabase
      .from('certificates')
      .select(
        '*, chemicals(chemical_name, cas_number, ec_number, tonnage_band), tcc_applications!certificates_tcc_application_id_fkey(*, chemicals(*))'
      )
      .eq('client_id', clientId)
      .order('created_at', { ascending: false }),
    adminSupabase
      .from('activity_logs')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  if (clientError || !client) {
    return null;
  }

  const tccHistory = await enrichTccApplicationsWithRcQuota(
    adminSupabase,
    (tccHistoryRaw || []).map((row: { chemicals?: unknown; certificates?: unknown; client_chemicals?: unknown }) => ({
      ...row,
      chemicals: Array.isArray(row.chemicals) ? row.chemicals[0] : row.chemicals,
      certificates: Array.isArray(row.certificates) ? row.certificates[0] ?? null : row.certificates,
      client_chemicals: Array.isArray(row.client_chemicals)
        ? row.client_chemicals[0] ?? null
        : row.client_chemicals,
    }))
  );

  const normalizedCertificates = (certificates || []).map(
    (row: { chemicals?: unknown; tcc_applications?: unknown }) => ({
      ...row,
      chemicals: Array.isArray(row.chemicals) ? row.chemicals[0] : row.chemicals,
      tcc_applications: Array.isArray(row.tcc_applications)
        ? row.tcc_applications[0] ?? null
        : row.tcc_applications,
    })
  );

  return {
    client,
    user,
    clientChemicals: clientChemicals || [],
    contacts: contacts || [],
    tccHistory,
    certificates: normalizedCertificates,
    activityLogs: activityLogs || [],
  };
}
