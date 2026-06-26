import { prisma } from '@/lib/prisma';

const TCC_APPLICATION_COLUMNS = [
  { name: 'eu_importer_company_name', ddl: 'VARCHAR(255) NULL' },
  { name: 'eu_importer_address', ddl: 'TEXT NULL' },
  { name: 'purchase_order_number', ddl: 'VARCHAR(255) NULL' },
  { name: 'invoice_number', ddl: 'VARCHAR(255) NULL' },
  { name: 'regulatory_framework', ddl: 'VARCHAR(255) NULL' },
  { name: 'reach_certificate_id', ddl: 'CHAR(36) NULL' },
  { name: 'certificate_issue_date', ddl: 'DATE NULL' },
  { name: 'certificate_valid_until_date', ddl: 'DATE NULL' },
] as const;

let cachedColumns: Set<string> | null = null;
let ensureInFlight: Promise<boolean> | null = null;

async function listTableColumns(table: string): Promise<Set<string>> {
  const rows = await prisma.$queryRawUnsafe<Array<{ Field: string }>>(
    `SHOW COLUMNS FROM \`${table}\``
  );
  return new Set((rows || []).map((row) => row.Field));
}

export async function getTccApplicationTableColumns(): Promise<Set<string>> {
  if (cachedColumns) return cachedColumns;
  cachedColumns = await listTableColumns('tcc_applications');
  return cachedColumns;
}

export async function hasTccApplicationColumn(column: string): Promise<boolean> {
  const columns = await getTccApplicationTableColumns();
  return columns.has(column);
}

async function ensureColumn(table: string, name: string, ddl: string): Promise<void> {
  const columns = await getTccApplicationTableColumns();
  if (columns.has(name)) return;

  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`${table}\` ADD COLUMN \`${name}\` ${ddl}`
    );
    cachedColumns = null;
    cachedColumns = await listTableColumns(table);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Duplicate column')) {
      cachedColumns = null;
      cachedColumns = await listTableColumns(table);
      return;
    }
    throw err;
  }
}

/** Add any missing TCC application columns required by the current portal code. */
export async function ensureTccApplicationSchema(): Promise<boolean> {
  if (ensureInFlight) return ensureInFlight;

  ensureInFlight = (async () => {
    try {
      cachedColumns = null;
      for (const column of TCC_APPLICATION_COLUMNS) {
        await ensureColumn('tcc_applications', column.name, column.ddl);
      }
      cachedColumns = await listTableColumns('tcc_applications');
      return TCC_APPLICATION_COLUMNS.every((column) => cachedColumns?.has(column.name));
    } catch (err) {
      console.error('[tcc] ensureTccApplicationSchema failed:', err);
      cachedColumns = null;
      return false;
    } finally {
      ensureInFlight = null;
    }
  })();

  return ensureInFlight;
}

const ADMIN_TCC_APPLICATION_FIELDS = [
  'id',
  'client_id',
  'chemical_id',
  'client_chemical_id',
  'status',
  'quantity_mt',
  'export_date',
  'eu_importer_company_name',
  'eu_importer_address',
  'purchase_order_number',
  'invoice_number',
  'certificate_issue_date',
  'registration_number',
  'remarks',
  'reach_certificate_id',
  'regulatory_framework',
  'certificate_valid_until_date',
] as const;

export async function buildAdminTccApplicationSelect(): Promise<string> {
  await ensureTccApplicationSchema();
  const columns = await getTccApplicationTableColumns();
  return ADMIN_TCC_APPLICATION_FIELDS.filter((field) => columns.has(field)).join(', ');
}
