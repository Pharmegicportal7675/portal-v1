export type ActivityFieldChange = {
  field: string;
  label: string;
  from: string;
  to: string;
};

function displayValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    const joined = value.map((v) => String(v).trim()).filter(Boolean).join(', ');
    return joined || '—';
  }
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : '—';
}

function normalizeCompare(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    return value
      .map((v) => String(v).trim().toLowerCase())
      .filter(Boolean)
      .sort()
      .join('|');
  }
  return String(value).trim().toLowerCase();
}

/** Build a list of changed fields between two snapshots. */
export function buildActivityFieldChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  labels: Record<string, string>
): ActivityFieldChange[] {
  const changes: ActivityFieldChange[] = [];
  const fields = Object.keys(labels);

  for (const field of fields) {
    const fromRaw = before[field];
    const toRaw = after[field];
    if (normalizeCompare(fromRaw) === normalizeCompare(toRaw)) continue;
    changes.push({
      field,
      label: labels[field] || field,
      from: displayValue(fromRaw),
      to: displayValue(toRaw),
    });
  }

  return changes;
}

/** Human-readable summary: "Email: a → b; Role: — → Manager" */
export function formatActivityFieldChangesDescription(
  changes: ActivityFieldChange[],
  fallback: string
): string {
  if (changes.length === 0) return fallback;
  return changes.map((c) => `${c.label}: ${c.from} → ${c.to}`).join('; ');
}

export function parseActivityFieldChanges(metadata: unknown): ActivityFieldChange[] {
  if (!metadata || typeof metadata !== 'object') return [];
  const changes = (metadata as { changes?: unknown }).changes;
  if (!Array.isArray(changes)) return [];

  return changes
    .filter(
      (row): row is ActivityFieldChange =>
        Boolean(row) &&
        typeof row === 'object' &&
        typeof (row as ActivityFieldChange).label === 'string' &&
        typeof (row as ActivityFieldChange).from === 'string' &&
        typeof (row as ActivityFieldChange).to === 'string'
    )
    .map((row) => ({
      field: typeof row.field === 'string' ? row.field : '',
      label: row.label,
      from: row.from,
      to: row.to,
    }));
}

export const CONTACT_FIELD_LABELS: Record<string, string> = {
  first_name: 'First name',
  last_name: 'Last name',
  email: 'Email',
  phone: 'Mobile',
  role: 'Role',
};

export const CLIENT_PROFILE_FIELD_LABELS: Record<string, string> = {
  company_name: 'Company name',
  uuid_number: 'UUID number',
  owner_name: 'Owner',
  email: 'Login email',
  phone: 'Mobile',
  primary_contact_first_name: 'Primary first name',
  primary_contact_last_name: 'Primary last name',
  address: 'Address',
  city: 'City',
  state: 'State',
  country: 'Country',
  postal_code: 'Postal code',
  status: 'Status',
  regulatory_registrations: 'Regulatory registrations',
};
