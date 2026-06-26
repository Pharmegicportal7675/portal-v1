import { formatErrorMessage } from '@/lib/format-error';

const TCC_SCHEMA_HINT =
  'Run npm run db:migrate:tcc-schema or apply prisma/migrations/tcc-application-schema.sql on the database, then try again.';

export function tccSaveErrorMessage(err: unknown): string {
  const message = formatErrorMessage(err);
  const lower = message.toLowerCase();
  const looksLikeMissingColumn =
    lower.includes('unknown column') ||
    lower.includes('does not exist in the current database') ||
    lower.includes('pgrst204');

  if (looksLikeMissingColumn && message.includes('certificate_valid_until_date')) {
    return 'Database could not write the Valid Upto date. Redeploy the latest portal build, then try saving again.';
  }
  if (
    looksLikeMissingColumn &&
    (message.includes('eu_importer') ||
      message.includes('purchase_order_number') ||
      message.includes('invoice_number'))
  ) {
    return `Database is missing TCC EU Importer columns. ${TCC_SCHEMA_HINT}`;
  }
  if (looksLikeMissingColumn && message.includes('certificate_issue_date')) {
    return `Database is missing the certificate issue date column. ${TCC_SCHEMA_HINT}`;
  }
  if (looksLikeMissingColumn && message.includes('reach_certificate_id')) {
    return `Database is missing the REACH certificate link column. ${TCC_SCHEMA_HINT}`;
  }
  if (looksLikeMissingColumn && message.includes('regulatory_framework')) {
    return `Database is missing the regulatory framework column. ${TCC_SCHEMA_HINT}`;
  }
  if (message.includes('tcc_application_notification_emails')) {
    return `Database is missing admin notification email settings. Run npm run db:import or apply prisma/database.mysql.sql, then try again.`;
  }
  if (message.includes('regulatory_registrations')) {
    return `Database is missing client regulatory registration columns. Run npm run db:import or apply prisma/database.mysql.sql, then try again.`;
  }
  if (message.includes('PGRST204')) {
    return `Database schema is out of date for TCC applications. ${TCC_SCHEMA_HINT}`;
  }

  return message || 'Failed to save application.';
}
