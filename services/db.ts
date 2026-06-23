import type { DbClient } from '@/lib/db/types';
import { computeTccQuotaForExportDate } from '@/lib/quota';
import { REACH_CERTIFICATE_TYPE, getReachCertificateYear } from '@/lib/reach-certificate';
import {
  REGULATORY_REGISTRATIONS,
  normalizeRegulatoryRegistrations,
} from '@/lib/regulatory-registrations';

// ============================================================================
// ADMIN DASHBOARD SERVICES
// ============================================================================
export async function getAdminDashboardStats(supabase: DbClient) {
  // Run all 3 independent queries in parallel
  const [
    clientsRes,
    pendingTccRes,
    activeClientsRes,
  ] = await Promise.all([
    supabase.from('clients').select('*', { count: 'exact', head: true }),
    supabase
      .from('tcc_applications')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .or('regulatory_framework.is.null,regulatory_framework.eq.eu_reach'),
    supabase
      .from('clients')
      .select('country, regulatory_registrations, status')
      .eq('status', 'active'),
  ]);

  const totalClients = clientsRes.count;
  const pendingTcc = pendingTccRes.count;
  const activeClients = activeClientsRes.data || [];
  const activeClientCount = activeClients.length || totalClients || 0;

  const reachStats = [
    {
      key: REGULATORY_REGISTRATIONS.EU_REACH,
      label: 'EU REACH',
      color: '#2563eb',
      bgColor: 'bg-sky-50',
      textColor: 'text-sky-600',
    },
    {
      key: REGULATORY_REGISTRATIONS.UK_REACH,
      label: 'UK REACH',
      color: '#059669',
      bgColor: 'bg-emerald-50',
      textColor: 'text-emerald-600',
    },
    {
      key: REGULATORY_REGISTRATIONS.TURKEY_KKDIK,
      label: 'Turkey REACH (KKDIK)',
      color: '#b45309',
      bgColor: 'bg-amber-50',
      textColor: 'text-amber-700',
    },
  ].map((item) => {
    const clientsInReach = activeClients.filter((client: any) =>
      normalizeRegulatoryRegistrations(client.regulatory_registrations).includes(item.key)
    );
    const count = clientsInReach.length;
    const percent = activeClientCount > 0 ? Math.round((count / activeClientCount) * 100) : 0;

    const countryMap = new Map<string, number>();
    clientsInReach.forEach((client: any) => {
      const country = client.country?.trim() || 'Unknown';
      countryMap.set(country, (countryMap.get(country) || 0) + 1);
    });
    const countryChartData = Array.from(countryMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return { ...item, count, percent, countryChartData };
  });

  return {
    stats: {
      totalClients: totalClients || 0,
      pendingTcc: pendingTcc || 0,
    },
    reachStats,
  };
}

// ============================================================================
// CLIENT MANAGEMENT SERVICES (Admin Portal)
// ============================================================================
export async function getClients(
  supabase: DbClient,
  search = '',
  status = 'all',
  limit = 10,
  offset = 0
) {
  let query = supabase.from('clients').select('*', { count: 'exact' });

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  if (search) {
    query = query.or(`company_name.ilike.%${search}%,email.ilike.%${search}%`);
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  return {
    clients: data || [],
    totalCount: count || 0,
  };
}

export async function getActiveSubstanceCountsByClient(
  supabase: DbClient,
  clientIds: string[]
): Promise<Record<string, number>> {
  if (clientIds.length === 0) return {};

  const { data, error } = await supabase
    .from('client_chemicals')
    .select('client_id')
    .in('client_id', clientIds)
    .eq('status', 'active');

  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const row of data || []) {
    counts[row.client_id] = (counts[row.client_id] || 0) + 1;
  }
  return counts;
}

// ============================================================================
// CHEMICAL INVENTORY SERVICES
// ============================================================================
export async function getChemicals(supabase: DbClient, search = '', status = 'all') {
  let query = supabase.from('chemicals').select(`
    *,
    client_chemicals (
      status,
      available_quantity,
      clients ( company_name )
    )
  `).in('status', ['active', 'inactive']);

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  if (search) {
    query = query.or(`chemical_name.ilike.%${search}%,cas_number.ilike.%${search}%`);
  }

  const { data, error } = await query.order('chemical_name', { ascending: true });
  if (error) throw error;

  const rows = data || [];
  const chemicalIds = rows.map((r: any) => r.id as string);

  const exportedByChemicalId: Record<string, number> = {};
  if (chemicalIds.length > 0) {
    const { data: approvedTccs, error: tccError } = await supabase
      .from('tcc_applications')
      .select('chemical_id, quantity_mt')
      .eq('status', 'approved')
      .in('chemical_id', chemicalIds);

    if (tccError) throw tccError;

    for (const tcc of approvedTccs || []) {
      const id = tcc.chemical_id as string;
      exportedByChemicalId[id] =
        (exportedByChemicalId[id] || 0) + Number(tcc.quantity_mt ?? 0);
    }
  }

  return rows.map((row: any) => {
    const links = (row.client_chemicals || []) as {
      status: string;
      available_quantity: number;
      clients: { company_name: string } | null;
    }[];
    const activeLinks = links.filter((cc) => cc.status !== 'trashed');

    const company_names = [
      ...new Set(
        activeLinks
          .filter((cc) => cc.clients?.company_name)
          .map((cc) => cc.clients!.company_name)
      ),
    ].sort((a, b) => a.localeCompare(b));

    const remaining_quota = activeLinks.reduce(
      (sum, cc) => sum + Number(cc.available_quantity ?? 0),
      0
    );
    const exported_mt = exportedByChemicalId[row.id as string] ?? 0;
    const total_quota = remaining_quota + exported_mt;

    const { client_chemicals: _omit, ...chem } = row as Record<string, unknown> & {
      client_chemicals?: unknown;
    };
    return {
      ...chem,
      company_names,
      remaining_quota,
      exported_mt,
      total_quota,
    };
  });
}

export async function getTrashedChemicals(supabase: DbClient) {
  const { data, error } = await supabase
    .from('chemicals')
    .select('id, chemical_name, cas_number, ec_number, tonnage_band, validity_date, status, created_at')
    .eq('status', 'trashed')
    .order('chemical_name', { ascending: true });

  // 22P02 = enum value 'trashed' not added yet — run prisma/database.mysql.sql migration
  if (error) {
    if (error.code === '22P02') return [];
    throw error;
  }
  return data || [];
}

// ============================================================================
// TCC APPLICATIONS & CERTIFICATE APPROVALS
// ============================================================================
const REACH_QUOTA_CERT_SELECT =
  'id, certificate_number, client_id, chemical_id, status, expires_at, issued_at, type, allocated_quantity, tonnage_band, registration_number';

const TCC_APPROVED_EXPORT_SELECT =
  'id, client_id, chemical_id, quantity_mt, status, export_date, reach_certificate_id, updated_at, created_at, certificates!certificates_tcc_application_id_fkey(issued_at)';

async function enrichTccApplicationsWithRcQuota(
  supabase: DbClient,
  applications: Record<string, unknown>[]
) {
  if (!applications.length) return applications;

  const clientIds = [...new Set(applications.map((app) => app.client_id as string))];

  const [{ data: reachCerts }, { data: approvedApps }] = await Promise.all([
    supabase
      .from('certificates')
      .select(REACH_QUOTA_CERT_SELECT)
      .in('client_id', clientIds)
      .eq('type', REACH_CERTIFICATE_TYPE)
      .neq('status', 'revoked'),
    supabase
      .from('tcc_applications')
      .select(TCC_APPROVED_EXPORT_SELECT)
      .in('client_id', clientIds)
      .eq('status', 'approved'),
  ]);

  return applications.map((app) => {
    if (!app.export_date) {
      return { ...app, rc_remaining_quota: null, rc_period_certificate: null, rc_tonnage_band: null, rc_registration_number: null, rc_certificate_year: null };
    }

    const chem = Array.isArray(app.chemicals) ? app.chemicals[0] : app.chemicals;
    const quota = computeTccQuotaForExportDate({
      reachCertificates: (reachCerts || []).filter((cert: any) => cert.client_id === app.client_id),
      approvedApplications: approvedApps || [],
      chemicalId: app.chemical_id as string,
      exportDate: app.export_date as string,
      tonnageBand: (chem as { tonnage_band?: string | null } | null)?.tonnage_band ?? null,
      excludeApplicationId: app.status === 'approved' ? undefined : (app.id as string),
    });

    return {
      ...app,
      rc_remaining_quota: quota.remainingQuota,
      rc_period_certificate: quota.reachCert?.certificate_number ?? null,
      rc_tonnage_band: quota.reachCert?.tonnage_band ?? null,
      rc_registration_number: quota.reachCert?.registration_number ?? null,
      rc_certificate_year: getReachCertificateYear(quota.reachCert?.issued_at ?? null),
    };
  });
}

export async function getTccApplications(
  supabase: DbClient,
  statusFilter = 'all',
  options?: { euReachOnly?: boolean }
) {
  let query = supabase.from('tcc_applications').select(`
    *,
    clients (company_name, email),
    chemicals (chemical_name, cas_number, ec_number, tonnage_band, validity_date, available_quantity),
    client_chemicals (available_quantity, registration_number),
    certificates!certificates_tcc_application_id_fkey (*)
  `);

  if (options?.euReachOnly) {
    query = query.or('regulatory_framework.is.null,regulatory_framework.eq.eu_reach');
  }

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return enrichTccApplicationsWithRcQuota(supabase, data || []);
}

// ============================================================================
// TEMPLATE SERVICES
// ============================================================================
export async function getActiveTemplate(supabase: DbClient) {
  const { data, error } = await supabase
    .from('templates')
    .select('*')
    .limit(1)
    .single();

  if (error) return null;
  return data;
}
