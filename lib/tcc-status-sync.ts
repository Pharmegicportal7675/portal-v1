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
  certificate: TccStatusCertificate | null;
};

type StatusRow = {
  id: string;
  status: string;
  updated_at?: string | null;
  certificates?: unknown;
};

function certificateNumber(certificates: unknown): string {
  const cert = Array.isArray(certificates) ? certificates[0] : certificates;
  if (!cert || typeof cert !== 'object' || !('certificate_number' in cert)) return '';
  return String((cert as { certificate_number?: string | null }).certificate_number ?? '');
}

/** Overlay the latest TCC status and certificate onto rows the screen already has. */
export function applyTccStatusUpdates<T extends StatusRow>(rows: T[], updates: TccStatusUpdate[]): T[] {
  if (updates.length === 0 || rows.length === 0) return rows;

  const byId = new Map(updates.map((update) => [update.id, update]));
  let changed = false;

  const next = rows.map((row) => {
    const update = byId.get(row.id);
    if (!update) return row;

    const nextNumber = update.certificate?.certificate_number ?? '';
    if (update.status === row.status && certificateNumber(row.certificates) === nextNumber) {
      return row;
    }

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
      certificates,
    };
  });

  return changed ? next : rows;
}
