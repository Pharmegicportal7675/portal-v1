import { formatDisplayDate } from '@/lib/date-filter';

export type TccApplicationFieldChange = {
  field: string;
  label: string;
  from: string;
  to: string;
};

export type TccApplicationChangeLogEntry = {
  id: string;
  action: string;
  description: string | null;
  created_at: string;
  adminEmail?: string | null;
  changes: TccApplicationFieldChange[];
};

const TRACKED_FIELD_LABELS: Record<string, string> = {
  eu_importer_company_name: 'EU importer company',
  eu_importer_address: 'EU importer address',
  purchase_order_number: 'Purchase order number',
  invoice_number: 'Invoice number',
  quantity_mt: 'Quantity (MT)',
  export_date: 'Expected export date',
  certificate_issue_date: 'Issue date',
  certificate_valid_until_date: 'Valid upto',
  registration_number: 'Registration number',
  remarks: 'Remarks',
};

const TRACKED_FIELDS = Object.keys(TRACKED_FIELD_LABELS);

function normalizeCompareValue(field: string, value: unknown): string {
  if (value == null || value === '') return '';
  if (field === 'quantity_mt') return Number(value).toFixed(2);
  if (field === 'certificate_issue_date' || field === 'export_date' || field === 'certificate_valid_until_date') {
    return String(value).split('T')[0];
  }
  return String(value).trim();
}

function formatChangeValue(field: string, value: unknown): string {
  if (value == null || value === '') return '—';
  if (field === 'quantity_mt') return `${value} MT`;
  if (field === 'certificate_issue_date' || field === 'export_date' || field === 'certificate_valid_until_date') {
    return formatDisplayDate(String(value).split('T')[0]) || '—';
  }
  return String(value).trim() || '—';
}

export function buildTccApplicationFieldChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): TccApplicationFieldChange[] {
  const changes: TccApplicationFieldChange[] = [];

  for (const field of TRACKED_FIELDS) {
    const fromNorm = normalizeCompareValue(field, before[field]);
    const toNorm = normalizeCompareValue(field, after[field]);
    if (fromNorm === toNorm) continue;

    changes.push({
      field,
      label: TRACKED_FIELD_LABELS[field] || field,
      from: formatChangeValue(field, before[field]),
      to: formatChangeValue(field, after[field]),
    });
  }

  return changes;
}

export function parseTccApplicationChangeLogMetadata(metadata: unknown): TccApplicationFieldChange[] {
  if (!metadata || typeof metadata !== 'object') return [];
  const changes = (metadata as { changes?: unknown }).changes;
  if (!Array.isArray(changes)) return [];

  return changes
    .filter(
      (row): row is TccApplicationFieldChange =>
        Boolean(row) &&
        typeof row === 'object' &&
        typeof (row as TccApplicationFieldChange).label === 'string' &&
        typeof (row as TccApplicationFieldChange).from === 'string' &&
        typeof (row as TccApplicationFieldChange).to === 'string'
    )
    .map((row) => ({
      field: row.field || '',
      label: row.label,
      from: row.from,
      to: row.to,
    }));
}

export function formatTccChangeLogAction(action: string): string {
  switch (action) {
    case 'TCC_ADMIN_EDIT':
      return 'Certificate / application updated';
    case 'TCC_APPROVED':
      return 'Approved & certificate issued';
    case 'TCC_CHANGES_REQUIRED':
      return 'Changes requested';
    case 'TCC_REJECTED':
      return 'Application rejected';
    default:
      return action.replace(/_/g, ' ');
  }
}
