export type TccStatusCertificate = {
  id: string;
  certificate_number: string;
  file_url: string | null;
  issued_at: string;
  status: string;
};

export type TccStatusUpdate = {
  id: string;
  client_id: string;
  status: string;
  updated_at: string;
  created_at: string;
  quantity_mt: number;
  export_date: string | null;
  registration_number: string | null;
  regulatory_framework: string | null;
  chemical_name: string;
  cas_number: string;
  ec_number: string | null;
  company_name: string;
  client_email: string | null;
  certificate: TccStatusCertificate | null;
};

type StatusRow = {
  id: string;
  status: string;
  updated_at?: string | null;
  quantity_mt?: unknown;
  export_date?: string | null;
  certificates?: unknown;
  rejection_reason?: string | null;
};

function certificateNumber(certificates: unknown): string {
  const cert = Array.isArray(certificates) ? certificates[0] : certificates;
  if (!cert || typeof cert !== 'object' || !('certificate_number' in cert)) return '';
  return String((cert as { certificate_number?: string | null }).certificate_number ?? '');
}

function quantityKey(value: unknown): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '';
  return numeric.toFixed(2);
}

function dateKey(value: unknown): string {
  if (!value) return '';
  const raw = value instanceof Date ? value.toISOString() : String(value);
  return raw.slice(0, 10);
}

function belongsOnList(
  update: TccStatusUpdate,
  insertMissing: 'all' | 'eu' | false,
  clientId?: string
) {
  if (!insertMissing) return false;
  if (clientId && update.client_id !== clientId) return false;
  if (insertMissing === 'all') return true;
  return !update.regulatory_framework || update.regulatory_framework === 'eu_reach';
}

function rowFromUpdate<T extends StatusRow>(update: TccStatusUpdate): T {
  return {
    id: update.id,
    client_id: update.client_id,
    status: update.status,
    updated_at: update.updated_at,
    created_at: update.created_at,
    quantity_mt: update.quantity_mt,
    export_date: update.export_date,
    registration_number: update.registration_number,
    regulatory_framework: update.regulatory_framework,
    certificates: update.certificate,
    chemicals: {
      chemical_name: update.chemical_name,
      cas_number: update.cas_number,
      ec_number: update.ec_number,
    },
    clients: {
      company_name: update.company_name,
      email: update.client_email || '',
    },
  } as unknown as T;
}

/** Overlay live TCC rows, including applications submitted after the page was opened. */
export function applyTccStatusUpdates<T extends StatusRow>(
  rows: T[],
  updates: TccStatusUpdate[],
  options?: { insertMissing?: 'all' | 'eu'; clientId?: string }
): T[] {
  if (updates.length === 0) return rows;

  const byId = new Map(updates.map((update) => [update.id, update]));
  const insertMissing = options?.insertMissing ?? false;
  let changed = false;

  const next = rows.map((row) => {
    const update = byId.get(row.id);
    if (!update) return row;

    const nextNumber = update.certificate?.certificate_number ?? '';
    const sameRow =
      update.status === row.status &&
      certificateNumber(row.certificates) === nextNumber &&
      quantityKey(row.quantity_mt) === quantityKey(update.quantity_mt) &&
      dateKey(row.export_date) === dateKey(update.export_date);
    if (sameRow) return row;

    changed = true;
    const currentCert = Array.isArray(row.certificates) ? row.certificates[0] : row.certificates;
    const certificates = update.certificate
      ? {
          ...(currentCert && typeof currentCert === 'object' ? currentCert : {}),
          ...update.certificate,
        }
      : row.certificates;

    return {
      ...row,
      status: update.status,
      updated_at: update.updated_at,
      quantity_mt: update.quantity_mt,
      export_date: update.export_date ?? row.export_date,
      ...(update.status === 'pending' ? { rejection_reason: null } : {}),
      certificates,
    };
  });

  const existingIds = new Set(rows.map((row) => row.id));
  const additions = updates
    .filter((update) => !existingIds.has(update.id) && belongsOnList(update, insertMissing, options?.clientId))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((update) => rowFromUpdate<T>(update));

  if (additions.length === 0) return changed ? next : rows;
  return [...additions, ...next];
}
