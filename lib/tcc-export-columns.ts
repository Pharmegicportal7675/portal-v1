import { formatDisplayDate } from '@/lib/date-filter';
import type { CsvColumn } from '@/lib/export-csv';
import {
  resolveTccApplicationCertificateNumber,
  resolveTccApplicationIssueDate,
  resolveTccCertificateRow,
} from '@/lib/tcc-application-certificate';
import {
  getTccApplicationAvailableQuota,
  resolveTccApplicationCertificateYear,
  resolveTccApplicationRegistrationNumber,
  resolveTccApplicationTonnageBand,
  type TccApplicationQuotaInput,
} from '@/lib/tcc-application-quota';

export type TccExportApplication = TccApplicationQuotaInput & {
  tracking_id?: string | null;
  quantity_mt: number;
  registration_number?: string | null;
  export_date: string | null;
  remarks?: string | null;
  status: string;
  created_at: string;
  updated_at?: string;
  certificate_issue_date?: string | null;
  invoice_number?: string | null;
  eu_importer_company_name?: string | null;
  eu_importer_address?: string | null;
  purchase_order_number?: string | null;
  chemicals?: {
    chemical_name?: string;
    cas_number?: string;
    ec_number?: string | null;
    tonnage_band?: string | null;
  } | null;
  clients?: {
    company_name?: string;
    email?: string;
  } | null;
  certificates?:
    | {
        certificate_number?: string | null;
        issued_at?: string | null;
        expires_at?: string | null;
        registration_number?: string | null;
      }
    | {
        certificate_number?: string | null;
        issued_at?: string | null;
        expires_at?: string | null;
        registration_number?: string | null;
      }[]
    | null;
  client_chemicals?:
    | { registration_number?: string | null }
    | { registration_number?: string | null }[]
    | null;
};

export type TccExportContext = {
  companyName?: string;
  clientEmail?: string;
};

function getApproveDate(app: TccExportApplication): string | null {
  if (app.status !== 'approved') return null;
  return app.updated_at ?? null;
}

function getValidUntil(app: TccExportApplication): string | null {
  const cert = resolveTccCertificateRow(app) as { expires_at?: string | null } | null;
  if (cert?.expires_at) {
    return formatDisplayDate(cert.expires_at);
  }
  return null;
}

export function buildTccExportColumns(
  context?: TccExportContext
): CsvColumn<TccExportApplication>[] {
  return [
    {
      header: 'Company',
      value: (app) => context?.companyName ?? app.clients?.company_name ?? '',
    },
    {
      header: 'Client Email',
      value: (app) => context?.clientEmail ?? app.clients?.email ?? '',
    },
    { header: 'Tracking ID', value: (app) => app.tracking_id },
    { header: 'Substance', value: (app) => app.chemicals?.chemical_name ?? '' },
    { header: 'CAS Number', value: (app) => app.chemicals?.cas_number ?? '' },
    { header: 'EC Number', value: (app) => app.chemicals?.ec_number ?? '' },
    { header: 'Tonnage Band', value: (app) => resolveTccApplicationTonnageBand(app) },
    { header: 'Certificate Year', value: (app) => resolveTccApplicationCertificateYear(app) },
    {
      header: 'Certificate No.',
      value: (app) => resolveTccApplicationCertificateNumber(app) ?? '',
    },
    {
      header: 'Issue Date',
      value: (app) => formatDisplayDate(resolveTccApplicationIssueDate(app)),
    },
    { header: 'Valid Upto', value: (app) => getValidUntil(app) },
    { header: 'Invoice No.', value: (app) => app.invoice_number?.trim() || '' },
    { header: 'Quantity (MT)', value: (app) => app.quantity_mt },
    {
      header: 'Available Quota (MT)',
      value: (app) => getTccApplicationAvailableQuota(app),
    },
    {
      header: 'Registration Number',
      value: (app) => resolveTccApplicationRegistrationNumber(app) ?? '',
    },
    { header: 'Export Date', value: (app) => formatDisplayDate(app.export_date) },
    {
      header: 'EU Importer Company Name',
      value: (app) => app.eu_importer_company_name?.trim() || '',
    },
    {
      header: 'EU Importer Address',
      value: (app) => app.eu_importer_address?.trim() || '',
    },
    {
      header: 'Purchase Order Number',
      value: (app) => app.purchase_order_number?.trim() || '',
    },
    { header: 'Remarks', value: (app) => app.remarks?.trim() || '' },
    { header: 'Submitted', value: (app) => formatDisplayDate(app.created_at) },
    { header: 'Approve Date', value: (app) => formatDisplayDate(getApproveDate(app)) },
    { header: 'Status', value: (app) => app.status },
  ];
}
