export type TccStatusCertificate = {
  id: string;
  certificate_number: string;
  file_url: string | null;
  issued_at: string;
  status: string;
};

export type TccStatusUpdate = {
  id: string;
  status: string;
  updated_at: string;
  quantity_mt: number;
  export_date: string | null;
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

/** Overlay the latest TCC status, quantity, and certificate onto rows the screen already has. */
export function applyTccStatusUpdates<T extends StatusRow>(rows: T[], updates: TccStatusUpdate[]): T[] {
  if (updates.length === 0 || rows.length === 0) return rows;

  const byId = new Map(updates.map((update) => [update.id, update]));
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

  return changed ? next : rows;
}
