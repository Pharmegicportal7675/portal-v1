'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { TableColumnFilter } from '@/components/ui/TableColumnFilter';
import { TableDateRangeFilter, type DateRangeValue } from '@/components/ui/TableDateRangeFilter';
import { TableDataExport } from '@/components/TableDataExport';
import { ResponsiveTableScroll } from '@/components/ui/ResponsiveTableScroll';
import { formatDisplayDate, matchesDateRange } from '@/lib/date-filter';
import type { CsvColumn } from '@/lib/export-csv';
import {
  getReachCertificateStatus,
  isActiveReachCertificate,
  getReachCertificateYear,
  canRenewReachForChemical,
  hasNewerReachCertificate,
  getReachCertsForClientChemical,
} from '@/lib/reach-certificate';
import {
  getReachCertAllocatedQuota,
  resolveDisplayedTonnageBand,
  sumApprovedExportsInReachWindow,
} from '@/lib/quota';
import {
  buildReachCertificateDocxPreviewUrl,
  buildReachCertificateDocxPreviewUrlByClientChemical,
  buildReachCertificatePdfDownloadUrl,
  buildReachCertificatePdfDownloadUrlByClientChemical,
} from '@/lib/reach-certificate-download';
import { canManageAdminRecords } from '@/lib/auth/roles';
import { CertificatePdfDownloadLink } from '@/components/CertificatePdfDownloadLink';
import {
  Building,
  Eye,
  RotateCcw,
  Download,
  PenLine,
  Trash2,
  Calendar,
} from 'lucide-react';

export type RcCertificateTableRecord = {
  id: string;
  client_id: string;
  chemical_id: string | null;
  certificate_number: string;
  registration_number: string | null;
  allocated_quantity?: number | null;
  tonnage_band?: string | null;
  issued_at: string;
  expires_at: string | null;
  status: string;
  mail_sent?: boolean;
  mail_sent_at?: string | null;
  clients?: {
    id: string;
    company_name: string;
    email: string;
    uuid_number: string | null;
  } | null;
  chemicals?: {
    chemical_name: string;
    cas_number: string;
    ec_number: string | null;
    tonnage_band: string | null;
  } | null;
  chemical?: {
    chemical_name: string;
    cas_number: string;
    ec_number: string | null;
    tonnage_band: string | null;
  } | null;
};

interface RcCertificatesTableProps {
  certificates: RcCertificateTableRecord[];
  clientChemicals?: any[];
  currentUserRole?: string;
  hideCompanyColumn?: boolean;
  hideMailColumn?: boolean;
  hideCheckboxColumn?: boolean;
  selectedIds?: string[];
  onSelectedIdsChange?: (ids: string[]) => void;
  onFilteredRowsChange?: (rows: RcCertificateTableRecord[]) => void;
  // Card customization
  title?: string;
  description?: string;
  extraActions?: React.ReactNode;
  exportFilename?: string;
  // Callback actions
  onEdit?: (cc: any, certId: string) => void;
  onRenew?: (cc: any, certId: string) => void;
  onDelete?: (cert: any) => void;
  clientId?: string;
  hideFilters?: boolean;
  tccHistory?: any[];
}

const EMPTY_DATE_RANGE: DateRangeValue = { from: '', to: '' };

const INITIAL_FILTERS = {
  company: '',
  certificate: '',
  registration: '',
  substance: '',
  status: 'all',
  issuedDate: { ...EMPTY_DATE_RANGE },
  validatedDate: { ...EMPTY_DATE_RANGE },
};

function matchesText(haystack: string, needle: string) {
  if (!needle.trim()) return true;
  return haystack.toLowerCase().includes(needle.trim().toLowerCase());
}

function findClientChemRow(
  clientChemicals: any[] | undefined,
  clientId: string,
  chemicalId: string | null | undefined
) {
  if (!clientChemicals || !chemicalId) return undefined;
  return clientChemicals.find(
    (row) => row.chemical_id === chemicalId && row.client_id === clientId
  );
}

function resolveClientChemForActions(
  clientChemicals: any[] | undefined,
  cert: RcCertificateTableRecord,
  group: { clientId: string; chemicalId: string | null }
) {
  const clientId = cert.client_id || group.clientId;
  const chemicalId = cert.chemical_id ?? group.chemicalId;
  const existing = findClientChemRow(clientChemicals, clientId, chemicalId);
  if (existing) return existing;

  const chem = cert.chemicals || cert.chemical;
  if (!chemicalId || !chem) return undefined;

  return {
    client_id: clientId,
    chemical_id: chemicalId,
    chemicals: chem,
    tonnage_band: cert.tonnage_band || chem.tonnage_band,
    validity_date: cert.expires_at,
    registration_number: cert.registration_number,
    issued_date: cert.issued_at?.slice(0, 10),
    certificate_number: cert.certificate_number,
  };
}

function buildPendingReachPreviewUrls(
  clientId: string,
  chemicalId: string | null | undefined,
  cc: ReturnType<typeof findClientChemRow> | undefined,
  tonnageBand?: string
) {
  if (!chemicalId) return null;

  const previewParams = {
    clientId,
    chemicalId,
    registrationNumber: cc?.registration_number?.trim() || undefined,
    issuedDate: cc?.issued_date?.split?.('T')[0] || undefined,
    validatedDate: cc?.validity_date?.split?.('T')[0] || undefined,
    tonnageBand:
      tonnageBand && tonnageBand !== 'None'
        ? tonnageBand
        : cc?.chemicals?.tonnage_band?.trim() || undefined,
  };

  return {
    ...previewParams,
    pdfUrl: buildReachCertificatePdfDownloadUrlByClientChemical(previewParams),
    docxUrl: buildReachCertificateDocxPreviewUrlByClientChemical(previewParams),
  };
}

export default function RcCertificatesTable({
  certificates,
  clientChemicals,
  currentUserRole,
  hideCompanyColumn = false,
  hideMailColumn = false,
  selectedIds = [],
  onFilteredRowsChange,
  title,
  description,
  extraActions,
  exportFilename = 'rc-certificates',
  onEdit,
  onRenew,
  onDelete,
  clientId,
  hideFilters = false,
  tccHistory,
}: RcCertificatesTableProps) {
  const [columnFilters, setColumnFilters] = useState(INITIAL_FILTERS);
  const canManageRc = canManageAdminRecords(currentUserRole);

  const filteredCertificates = useMemo(() => {
    return certificates.filter((cert) => {
      const clientName = cert.clients?.company_name || '';
      if (!hideCompanyColumn && !matchesText(clientName, columnFilters.company)) return false;
      if (!matchesText(cert.certificate_number || '', columnFilters.certificate)) return false;
      if (!matchesText(cert.registration_number || '', columnFilters.registration)) return false;

      const chem = cert.chemicals || cert.chemical;
      const substanceHaystack = [
        chem?.chemical_name || '',
        chem?.cas_number || '',
        chem?.ec_number || '',
      ].join(' ');
      if (!matchesText(substanceHaystack, columnFilters.substance)) return false;

      if (columnFilters.status !== 'all') {
        const certStatus = isActiveReachCertificate(cert as any)
          ? 'valid'
          : getReachCertificateStatus(cert as any);
        if (certStatus !== columnFilters.status) return false;
      }

      if (
        !matchesDateRange(
          cert.issued_at,
          columnFilters.issuedDate.from,
          columnFilters.issuedDate.to
        )
      ) {
        return false;
      }

      if (
        !matchesDateRange(
          cert.expires_at,
          columnFilters.validatedDate.from,
          columnFilters.validatedDate.to
        )
      ) {
        return false;
      }

      return true;
    });
  }, [certificates, columnFilters, hideCompanyColumn]);

  const filteredIds = useMemo(
    () => filteredCertificates.map((cert) => cert.id),
    [filteredCertificates]
  );

  // Sync filtered rows back to parent for totals/exports if needed
  const filteredIdsStr = filteredIds.join(',');
  useEffect(() => {
    onFilteredRowsChange?.(filteredCertificates);
  }, [filteredIdsStr]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (!hideCompanyColumn && columnFilters.company.trim()) count++;
    if (columnFilters.certificate.trim()) count++;
    if (columnFilters.registration.trim()) count++;
    if (columnFilters.substance.trim()) count++;
    if (columnFilters.status !== 'all') count++;
    if (columnFilters.issuedDate.from || columnFilters.issuedDate.to) count++;
    if (columnFilters.validatedDate.from || columnFilters.validatedDate.to) count++;
    return count;
  }, [columnFilters, hideCompanyColumn]);

  const updateColumnFilter = <K extends keyof typeof columnFilters>(
    key: K,
    value: (typeof columnFilters)[K]
  ) => {
    setColumnFilters((current) => ({ ...current, [key]: value }));
  };

  const clearAllFilters = () => {
    setColumnFilters({
      company: '',
      certificate: '',
      registration: '',
      substance: '',
      status: 'all',
      issuedDate: { ...EMPTY_DATE_RANGE },
      validatedDate: { ...EMPTY_DATE_RANGE },
    });
  };

  // Group certificates by unique combination of client_id + chemical_id
  const groupedData = useMemo(() => {
    const groups: {
      key: string;
      clientId: string;
      companyName: string;
      clientEmail: string;
      chemicalId: string | null;
      chemicalName: string;
      casNumber: string;
      ecNumber: string;
      registrationNumber: string;
      tonnageBand: string;
      certs: RcCertificateTableRecord[];
    }[] = [];

    const groupMap = new Map<string, typeof groups[number]>();

    for (const cert of filteredCertificates) {
      const chem = cert.chemicals || cert.chemical;
      const chemId = cert.chemical_id;
      const clientId = cert.client_id;
      const groupKey = `${clientId}_${chemId || 'unassigned'}`;

      let group = groupMap.get(groupKey);
      if (!group) {
        group = {
          key: groupKey,
          clientId,
          companyName: cert.clients?.company_name || '—',
          clientEmail: cert.clients?.email || '',
          chemicalId: chemId,
          chemicalName: chem?.chemical_name || 'Unknown Substance',
          casNumber: chem?.cas_number || 'N/A',
          ecNumber: chem?.ec_number || 'N/A',
          registrationNumber: cert.registration_number?.trim() || 'N/A',
          tonnageBand: resolveDisplayedTonnageBand(cert.tonnage_band, chem?.tonnage_band),
          certs: [],
        };
        groupMap.set(groupKey, group);
        groups.push(group);
      }
      group.certs.push(cert);
      if (cert.tonnage_band?.trim()) {
        group.tonnageBand = cert.tonnage_band.trim();
      }
    }

    // Add any client chemicals that don't have any certificates in the filteredCertificates list
    if (clientChemicals) {
      const clientCompanyNames = new Map<string, string>();
      for (const cert of filteredCertificates) {
        if (cert.clients?.company_name) {
          clientCompanyNames.set(cert.client_id, cert.clients.company_name);
        }
      }
      for (const cc of clientChemicals) {
        const ccClientName = cc.clients?.company_name;
        if (ccClientName) {
          clientCompanyNames.set(cc.client_id, ccClientName);
        }
      }

      for (const cc of clientChemicals) {
        const chemId = cc.chemical_id;
        const clientId = cc.client_id;
        const groupKey = `${clientId}_${chemId}`;

        if (!groupMap.has(groupKey)) {
          const chem = cc.chemicals;
          const companyName =
            cc.clients?.company_name || clientCompanyNames.get(clientId) || '—';
          const group = {
            key: groupKey,
            clientId,
            companyName: companyName,
            clientEmail: cc.clients?.email || '',
            chemicalId: chemId,
            chemicalName: chem?.chemical_name || 'Unknown Substance',
            casNumber: chem?.cas_number || 'N/A',
            ecNumber: chem?.ec_number || 'N/A',
            registrationNumber: cc.registration_number?.trim() || 'N/A',
            tonnageBand: resolveDisplayedTonnageBand(null, chem?.tonnage_band),
            certs: [],
          };
          groupMap.set(groupKey, group);
          groups.push(group);
        }
      }
    }

    // Sort groups by chemical name
    groups.sort((a, b) => a.chemicalName.localeCompare(b.chemicalName));

    // Sort certificates within each group by year descending (latest first)
    for (const g of groups) {
      g.certs.sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime());
    }

    return groups;
  }, [filteredCertificates, clientChemicals]);

  const exportColumns = useMemo(() => {
    const cols: CsvColumn<RcCertificateTableRecord>[] = [
      { header: 'Year', value: (row) => String(getReachCertificateYear(row.issued_at) ?? '') },
      { header: 'Certificate No.', value: (row) => row.certificate_number },
      { header: 'Registration No.', value: (row) => row.registration_number || '' },
    ];

    if (!hideCompanyColumn) {
      cols.push(
        { header: 'Company', value: (row) => row.clients?.company_name || '' },
        { header: 'Client Email', value: (row) => row.clients?.email || '' },
        { header: 'UUID', value: (row) => row.clients?.uuid_number || '' }
      );
    }

    cols.push(
      { header: 'Substance', value: (row) => (row.chemicals || row.chemical)?.chemical_name || '' },
      { header: 'CAS Number', value: (row) => (row.chemicals || row.chemical)?.cas_number || '' },
      { header: 'EC Number', value: (row) => (row.chemicals || row.chemical)?.ec_number || '' },
      {
        header: 'Tonnage Band',
        value: (row) =>
          resolveDisplayedTonnageBand(
            row.tonnage_band,
            (row.chemicals || row.chemical)?.tonnage_band
          ),
      },
      { header: 'Issued Date', value: (row) => formatDisplayDate(row.issued_at) },
      { header: 'Expiry Date', value: (row) => formatDisplayDate(row.expires_at) },
      {
        header: 'Status',
        value: (row) =>
          isActiveReachCertificate(row as any) ? 'Valid' : getReachCertificateStatus(row as any),
      }
    );

    if (!hideMailColumn) {
      cols.push(
        { header: 'Mail Sent', value: (row) => (row.mail_sent ? 'Yes' : 'No') },
        { header: 'Last Mail Sent', value: (row) => formatDisplayDate(row.mail_sent_at) }
      );
    }

    return cols;
  }, [hideCompanyColumn, hideMailColumn]);

  return (
    <div className="space-y-6">
      {/* Table Header / Title */}
      {(title || description || extraActions) && (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            {title && <h2 className="font-bold text-slate-800 text-base">{title}</h2>}
            {description && <p className="text-xs text-slate-500 mt-1">{description}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {extraActions}
            <TableDataExport
              filename={exportFilename}
              columns={exportColumns}
              filteredRows={filteredCertificates}
              selectedIds={selectedIds}
              getRowId={(row) => row.id}
            />
          </div>
        </div>
      )}

      <Card className="border border-slate-100 overflow-hidden shadow-sm rounded-xl">
        {(!hideFilters && activeFilterCount > 0) && (
          <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold text-slate-600">
              Showing {filteredCertificates.length} of {certificates.length} certificates
              <span className="text-primary ml-1">
                ({activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active)
              </span>
            </p>
            <Button type="button" variant="outline" size="sm" onClick={clearAllFilters} className="h-8 text-xs">
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Clear filters
            </Button>
          </div>
        )}

        <ResponsiveTableScroll>
          <table className="w-full text-left border-collapse min-w-[1024px] text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-100 align-top">
                <th className="px-4 py-3 min-w-[220px]">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Substance Info</span>
                  {!hideFilters && (
                    <TableColumnFilter
                      value={columnFilters.substance}
                      onChange={(value) => updateColumnFilter('substance', value)}
                      placeholder="Name / CAS…"
                    />
                  )}
                </th>
                <th className="px-4 py-3 min-w-[80px]">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Year</span>
                </th>
                <th className="px-4 py-3 min-w-[160px]">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Validity Period</span>
                  {!hideFilters && (
                    <TableDateRangeFilter
                      value={columnFilters.issuedDate}
                      onChange={(value) => updateColumnFilter('issuedDate', value)}
                    />
                  )}
                </th>
                <th className="px-4 py-3 min-w-[100px]">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Status</span>
                  {!hideFilters && (
                    <TableColumnFilter
                      type="select"
                      value={columnFilters.status}
                      onChange={(value) => updateColumnFilter('status', value)}
                      options={[
                        { value: 'all', label: 'All' },
                        { value: 'valid', label: 'Valid' },
                        { value: 'expired', label: 'Expired' },
                        { value: 'revoked', label: 'Revoked' },
                      ]}
                    />
                  )}
                </th>
                <th className="px-4 py-3 min-w-[130px]">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tonnage Band</span>
                </th>
                <th className="px-4 py-3 min-w-[210px]">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Quota Utilization</span>
                </th>
                {!hideMailColumn && (
                  <th className="px-4 py-3 min-w-[90px] text-[11px] font-bold text-slate-500 uppercase tracking-wider text-center">
                    Mail
                  </th>
                )}
                <th className="px-4 py-3 min-w-[110px] text-[11px] font-bold text-slate-500 uppercase tracking-wider text-center">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm bg-white">
              {groupedData.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      8 -
                      (hideMailColumn ? 1 : 0)
                    }
                    className="p-8 text-center text-slate-400 font-medium"
                  >
                    No RC certificates match the selected filters.
                  </td>
                </tr>
              ) : (
                groupedData.flatMap((group) => {
                  if (group.certs.length === 0) {
                    const chemId = group.chemicalId;
                    const cc = findClientChemRow(clientChemicals, group.clientId, chemId);

                    return (
                      <tr
                        key={`${group.key}_pending`}
                        className="hover:bg-slate-50/30 transition-colors border-t border-slate-200 bg-white"
                      >
                        {/* Chemical Info column */}
                        <td className="px-4 py-4 align-top border-r border-slate-100 bg-white">
                          <div className="flex flex-col gap-1 pr-2">
                            <span className="font-bold text-slate-800 text-sm leading-snug">
                              {group.chemicalName}
                            </span>
                            <div className="flex flex-col gap-0.5 text-[11px] text-slate-400 font-mono tracking-wide">
                              <span>CAS: {group.casNumber}</span>
                              <span>EC: {group.ecNumber}</span>
                              <span>Reg: {group.registrationNumber}</span>
                            </div>
                            {!hideCompanyColumn && (
                              <div className="mt-2 flex items-center gap-1.5">
                                <Building className="h-3 w-3 text-slate-400 shrink-0" />
                                {currentUserRole !== 'CLIENT' ? (
                                  <Link
                                    href={`/admin/clients/${group.clientId}`}
                                    className="font-bold text-teal-700 text-[11px] hover:text-teal-800 hover:underline"
                                  >
                                    {group.companyName}
                                  </Link>
                                ) : (
                                  <span className="font-bold text-slate-700 text-[11px]">
                                    {group.companyName}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Year column */}
                        <td className="px-4 py-3.5 align-middle">
                          <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold border bg-amber-50 border-amber-200 text-amber-700">
                            Pending
                          </span>
                        </td>

                        {/* Validity Period column */}
                        <td className="px-4 py-3.5 align-middle text-slate-400 italic text-xs">
                          No certificate issued
                        </td>

                        {/* Status column */}
                        <td className="px-4 py-3.5 align-middle">
                          <Badge variant="neutral" className="text-[10px] uppercase font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            Missing RC
                          </Badge>
                        </td>

                        {/* Tonnage Band column */}
                        <td className="px-4 py-3.5 align-middle">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-50 text-slate-500 border border-slate-200">
                            {group.tonnageBand}
                          </span>
                        </td>

                        {/* Quota Utilization column */}
                        <td className="px-4 py-3.5 align-middle text-slate-400 italic text-xs">
                          —
                        </td>

                        {/* Mail column */}
                        {!hideMailColumn && (
                          <td className="px-4 py-3.5 align-middle text-center text-slate-400">
                            —
                          </td>
                        )}

                        {/* Actions column */}
                        <td className="px-4 py-3.5 align-middle text-center">
                          <div className="flex justify-center gap-1">
                            {(() => {
                              const previewUrls = buildPendingReachPreviewUrls(
                                group.clientId,
                                group.chemicalId,
                                cc,
                                group.tonnageBand
                              );
                              if (!previewUrls) return null;
                              return (
                                <CertificatePdfDownloadLink
                                  pdfUrl={previewUrls.pdfUrl}
                                  docxUrl={previewUrls.docxUrl}
                                  previewDocxUrl={previewUrls.docxUrl}
                                  fileName={`${group.chemicalName.replace(/\s+/g, '_')}_rc-preview.pdf`}
                                  certificateType="rc"
                                  clientId={previewUrls.clientId}
                                  chemicalId={previewUrls.chemicalId ?? undefined}
                                  registrationNumber={previewUrls.registrationNumber}
                                  issuedDate={previewUrls.issuedDate}
                                  validatedDate={previewUrls.validatedDate}
                                  tonnageBand={previewUrls.tonnageBand}
                                  title="Download PDF"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
                                >
                                  <Download className="h-4 w-4" />
                                </CertificatePdfDownloadLink>
                              );
                            })()}

                            {canManageRc && group.chemicalId && (
                              <>
                                <Link
                                  href={`/admin/clients/${group.clientId}/rc-preview/${group.chemicalId}`}
                                  title="View certificate"
                                >
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-teal-700 hover:bg-teal-50">
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </Link>
                                {cc && onEdit ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-slate-600 hover:bg-slate-100"
                                    title="Edit substance details"
                                    onClick={() => onEdit(cc, '')}
                                  >
                                    <PenLine className="h-4 w-4" />
                                  </Button>
                                ) : (
                                  <Link
                                    href={`/admin/clients/${group.clientId}`}
                                    title="Edit on client profile"
                                  >
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0 text-slate-600 hover:bg-slate-100"
                                    >
                                      <PenLine className="h-4 w-4" />
                                    </Button>
                                  </Link>
                                )}
                                {onDelete && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                                    title="Delete substance assignment"
                                    onClick={() =>
                                      onDelete({
                                        chemical_id: group.chemicalId,
                                        client_id: group.clientId,
                                        id: '',
                                        chemical_name: group.chemicalName,
                                      })
                                    }
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return group.certs.map((cert, certIndex) => {
                    const isValid = isActiveReachCertificate(cert as any);
                    const status = getReachCertificateStatus(cert as any);
                    const yearVal = getReachCertificateYear(cert.issued_at);

                    // Find mapping from clientChemicals to calculate edit/renew actions
                    const chemId = cert.chemical_id;
                    const cc = resolveClientChemForActions(clientChemicals, cert, group);

                    const siblingCerts = cc && certificates
                      ? getReachCertsForClientChemical(
                          certificates as any[],
                          cc.chemical_id,
                          cc.chemicals?.cas_number,
                          cc.registration_number,
                          cc.certificate_number
                        )
                      : [];
                    const superseded = hasNewerReachCertificate(siblingCerts, cert as any);
                    const canRenewRow =
                      cc &&
                      status === 'expired' &&
                      !superseded &&
                      canRenewReachForChemical(siblingCerts, cc.validity_date);

                    // Quota math
                    const used = tccHistory && cert.chemical_id
                      ? sumApprovedExportsInReachWindow(tccHistory, cert.chemical_id, cert)
                      : 0;
                    const allocated = getReachCertAllocatedQuota(cert, group.tonnageBand);
                    const balance = Math.max(0, allocated - used);
                    const percentUsed = allocated > 0 ? Math.min(100, (used / allocated) * 100) : 0;

                    return (
                      <tr
                        key={cert.id}
                        className={`hover:bg-slate-50/30 transition-colors ${
                          certIndex === 0 ? 'border-t border-slate-200 bg-white' : 'bg-white'
                        }`}
                      >
                        {/* Chemical Info column (spanned) */}
                        {certIndex === 0 && (
                          <td
                            rowSpan={group.certs.length}
                            className="px-4 py-4 align-top border-r border-slate-100 bg-white"
                          >
                            <div className="flex flex-col gap-1 pr-2">
                              <span className="font-bold text-slate-800 text-sm leading-snug">
                                {group.chemicalName}
                              </span>
                              <div className="flex flex-col gap-0.5 text-[11px] text-slate-400 font-mono tracking-wide">
                                <span>CAS: {group.casNumber}</span>
                                <span>EC: {group.ecNumber}</span>
                                <span>Reg: {group.registrationNumber}</span>
                              </div>
                              {!hideCompanyColumn && (
                                <div className="mt-2 flex items-center gap-1.5">
                                  <Building className="h-3 w-3 text-slate-400 shrink-0" />
                                  {currentUserRole !== 'CLIENT' ? (
                                    <Link
                                      href={`/admin/clients/${cert.client_id}`}
                                      className="font-bold text-teal-700 text-[11px] hover:text-teal-800 hover:underline"
                                    >
                                      {group.companyName}
                                    </Link>
                                  ) : (
                                    <span className="font-bold text-slate-700 text-[11px]">
                                      {group.companyName}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        )}

                        {/* Year column */}
                        <td className="px-4 py-3.5 align-middle">
                          <span
                            className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                              isValid
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                : status === 'expired'
                                  ? 'bg-rose-50 border-rose-200 text-rose-700'
                                  : 'bg-slate-50 border-slate-200 text-slate-600'
                            }`}
                          >
                            {yearVal ?? '—'}
                          </span>
                        </td>

                        {/* Validity Period column */}
                        <td className="px-4 py-3.5 align-middle text-slate-600">
                          <div className="flex flex-col text-xs font-medium">
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              {formatDisplayDate(cert.issued_at)}
                            </span>
                            <span className="text-[11px] text-slate-400 pl-4.5">
                              to {formatDisplayDate(cert.expires_at)}
                            </span>
                          </div>
                        </td>

                        {/* Status column */}
                        <td className="px-4 py-3.5 align-middle">
                          <Badge
                            variant={isValid ? 'success' : status === 'expired' ? 'warning' : 'neutral'}
                            className="text-[10px] uppercase font-bold"
                          >
                            {isValid ? 'Active' : status === 'expired' ? 'Expired' : cert.status}
                          </Badge>
                        </td>

                        {/* Tonnage Band column */}
                        <td className="px-4 py-3.5 align-middle">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-50 text-slate-700 border border-slate-200">
                            {cert.tonnage_band || group.tonnageBand}
                          </span>
                        </td>

                        {/* Quota Utilization column */}
                        <td className="px-4 py-3.5 align-middle">
                          <div className="flex flex-col gap-1 max-w-[180px]">
                            <div className="flex justify-between text-xs font-bold">
                              <span className="text-slate-800 font-mono">
                                {used.toFixed(used % 1 === 0 ? 0 : 1)} / {allocated.toFixed(0)} MT
                              </span>
                              <span className="text-teal-600 font-mono">
                                {percentUsed.toFixed(0)}%
                              </span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-1.5 rounded-full ${
                                  percentUsed >= 100 ? 'bg-rose-500' : 'bg-teal-600'
                                }`}
                                style={{ width: `${percentUsed}%` }}
                              />
                            </div>
                            <div className="text-[10px] text-slate-500 font-medium">
                              Remaining: <span className="font-bold text-slate-700 font-mono">{balance.toFixed(balance % 1 === 0 ? 0 : 1)} MT</span>
                            </div>
                          </div>
                        </td>

                        {/* Mail column */}
                        {!hideMailColumn && (
                          <td className="px-4 py-3.5 align-middle text-center">
                            <Badge variant={cert.mail_sent ? 'success' : 'neutral'} className="text-[10px]">
                              {cert.mail_sent ? 'Sent' : 'Not sent'}
                            </Badge>
                          </td>
                        )}

                        {/* Actions column */}
                        <td className="px-4 py-3.5 align-middle text-center">
                          <div className="flex justify-center gap-1">
                            <CertificatePdfDownloadLink
                              pdfUrl={buildReachCertificatePdfDownloadUrl(cert.id)}
                              docxUrl={buildReachCertificateDocxPreviewUrl(cert.id)}
                              previewDocxUrl={buildReachCertificateDocxPreviewUrl(cert.id)}
                              fileName={`${cert.certificate_number || 'rc-certificate'}.pdf`}
                              certificateType="rc"
                              clientId={cert.client_id}
                              chemicalId={cert.chemical_id ?? undefined}
                              registrationNumber={cert.registration_number || undefined}
                              issuedDate={cert.issued_at?.split('T')[0]}
                              validatedDate={cert.expires_at?.split('T')[0]}
                              tonnageBand={cert.tonnage_band}
                              title="Download PDF"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
                            >
                              <Download className="h-4 w-4" />
                            </CertificatePdfDownloadLink>

                            {canManageRc && (
                              <>
                                <Link
                                  href={
                                    clientId
                                      ? `/admin/clients/${clientId}/rc-preview/${cert.chemical_id}?certId=${cert.id}`
                                      : `/admin/clients/${cert.client_id}/rc-preview/${cert.chemical_id}?certId=${cert.id}`
                                  }
                                  title="View certificate"
                                >
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-teal-700 hover:bg-teal-50">
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </Link>
                                {cc && onEdit ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-slate-600 hover:bg-slate-100"
                                    title="Edit substance details"
                                    onClick={() => onEdit(cc, cert.id)}
                                  >
                                    <PenLine className="h-4 w-4" />
                                  </Button>
                                ) : (
                                  canManageRc &&
                                  cert.chemical_id && (
                                    <Link
                                      href={`/admin/clients/${cert.client_id}/rc-preview/${cert.chemical_id}?certId=${cert.id}`}
                                      title="Edit certificate"
                                    >
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 text-slate-600 hover:bg-slate-100"
                                      >
                                        <PenLine className="h-4 w-4" />
                                      </Button>
                                    </Link>
                                  )
                                )}
                                {canRenewRow && cc && onRenew ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-teal-700 hover:bg-teal-50"
                                    title="Renew certificate"
                                    onClick={() => onRenew(cc, cert.id)}
                                  >
                                    <RotateCcw className="h-4 w-4" />
                                  </Button>
                                ) : (
                                  canRenewRow &&
                                  cert.chemical_id && (
                                    <Link
                                      href={`/admin/clients/${cert.client_id}`}
                                      title="Renew certificate on client profile"
                                    >
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 text-teal-700 hover:bg-teal-50"
                                      >
                                        <RotateCcw className="h-4 w-4" />
                                      </Button>
                                    </Link>
                                  )
                                )}
                                {onDelete && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                                    title="Delete certificate"
                                    onClick={() => onDelete(cert)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  });
                })
              )}
            </tbody>
          </table>
        </ResponsiveTableScroll>
      </Card>
    </div>
  );
}
