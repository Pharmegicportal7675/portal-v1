'use client';

import { useState, useTransition, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { processTccAction, deleteTccApplicationAction } from '@/actions/tcc';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Dialog } from './ui/Dialog';
import { TccApplicationViewDialog } from './TccApplicationViewDialog';
import { TableColumnFilter } from './ui/TableColumnFilter';
import { TableDateRangeFilter, type DateRangeValue } from './ui/TableDateRangeFilter';
import { TableNumberRangeFilter, type NumberRangeValue } from './ui/TableNumberRangeFilter';
import { matchesDateRange, formatDisplayDate } from '@/lib/date-filter';
import { matchesNumberRange } from '@/lib/number-filter';
import { getTccApplicationAvailableQuota, resolveTccApplicationRegistrationNumber } from '@/lib/tcc-application-quota';
import {
  resolveTccApplicationCertificateNumber,
  resolveTccApplicationIssueDate,
  resolveTccCertificateRow,
} from '@/lib/tcc-application-certificate';
import {
  buildTccCertificatePdfDownloadUrl,
} from '@/lib/tcc-certificate-download';
import { CertificatePdfDownloadLink } from '@/components/CertificatePdfDownloadLink';
import { TableDataExport } from '@/components/TableDataExport';
import { ResponsiveTableScroll } from './ui/ResponsiveTableScroll';
import type { TccEmailDefaults } from '@/components/TccApplicationViewDialog';
import type { CsvColumn } from '@/lib/export-csv';
import { toast } from '@/store/toast';
import { isEuReachFramework } from '@/lib/regulatory-registrations';
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Download,
  Calendar,
  Building,
  FlaskConical,
  MessageSquare,
  AlertCircle,
  RotateCcw,
  Eye,
  Trash2,
} from 'lucide-react';

interface CertificateRow {
  id: string;
  certificate_number: string;
  file_url: string | null;
  issued_at: string;
  registration_number?: string | null;
  mail_sent?: boolean;
  mail_sent_at?: string | null;
  mail_resend_count?: number;
  last_resend_at?: string | null;
}

interface Application {
  id: string;
  tracking_id?: string | null;
  client_id: string;
  chemical_id: string;
  quantity_mt: number;
  registration_number: string | null;
  export_date: string | null;
  remarks?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'changes_required' | 'modification_requested';
  rejection_reason: string | null;
  eu_importer_company_name?: string | null;
  eu_importer_address?: string | null;
  purchase_order_number?: string | null;
  invoice_number?: string | null;
  bo_attachment_url: string | null;
  bo_attachment_name: string | null;
  created_at: string;
  updated_at: string;
  certificate_issue_date?: string | null;
  rc_remaining_quota?: number | null;
  rc_period_certificate?: string | null;
  rc_tonnage_band?: string | null;
  rc_registration_number?: string | null;
  rc_certificate_year?: number | null;
  regulatory_framework?: string | null;
  client_chemicals?: { available_quantity: number; registration_number?: string | null } | null;
  clients: {
    company_name: string;
    email: string;
  };
  chemicals: {
    chemical_name: string;
    cas_number: string;
    ec_number: string | null;
    tonnage_band: string | null;
    validity_date: string | null;
    available_quantity: number;
  };
  certificates: CertificateRow | CertificateRow[] | null;
}

function isAwaitingReview(status: string) {
  return status === 'pending' || status === 'changes_required' || status === 'modification_requested';
}

interface ApprovalsDashboardProps {
  initialApplications: Application[];
  emailDefaults?: TccEmailDefaults;
}

const EMPTY_DATE_RANGE: DateRangeValue = { from: '', to: '' };
const EMPTY_NUMBER_RANGE: NumberRangeValue = { min: '', max: '' };

const INITIAL_COLUMN_FILTERS = {
  company: '',
  substance: '',
  quantity: { ...EMPTY_NUMBER_RANGE },
  exportDate: { ...EMPTY_DATE_RANGE },
  issueDate: { ...EMPTY_DATE_RANGE },
  approveDate: { ...EMPTY_DATE_RANGE },
  certificateNumber: '',
};

function matchesText(haystack: string, needle: string) {
  if (!needle.trim()) return true;
  return haystack.toLowerCase().includes(needle.trim().toLowerCase());
}

function resolveCertificate(app: Application): CertificateRow | null {
  return resolveTccCertificateRow(app) as CertificateRow | null;
}

function getApproveDate(app: Application): string | null {
  if (app.status !== 'approved') return null;
  return app.updated_at;
}

function getIssueDate(app: Application): string | null {
  return resolveTccApplicationIssueDate(app);
}

function getCertificateNumber(app: Application): string | null {
  return resolveTccApplicationCertificateNumber(app);
}

const TCC_EXPORT_COLUMNS: CsvColumn<Application>[] = [
  { header: 'Company', value: (app) => app.clients.company_name },
  { header: 'Client Email', value: (app) => app.clients.email },
  { header: 'Tracking ID', value: (app) => app.tracking_id },
  { header: 'Substance', value: (app) => app.chemicals.chemical_name },
  { header: 'CAS Number', value: (app) => app.chemicals.cas_number },
  { header: 'EC Number', value: (app) => app.chemicals.ec_number },
  { header: 'Quantity (MT)', value: (app) => app.quantity_mt },
  { header: 'Registration Number', value: (app) => resolveTccApplicationRegistrationNumber(app) },
  { header: 'Export Date', value: (app) => formatDisplayDate(app.export_date) },
  { header: 'Submitted', value: (app) => formatDisplayDate(app.created_at) },
  { header: 'Issue Date', value: (app) => formatDisplayDate(getIssueDate(app)) },
  { header: 'Approve Date', value: (app) => formatDisplayDate(getApproveDate(app)) },
  { header: 'Status', value: (app) => app.status },
  { header: 'Certificate No.', value: (app) => getCertificateNumber(app) },
];

export default function ApprovalsDashboard({ initialApplications, emailDefaults }: ApprovalsDashboardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [applications, setApplications] = useState<Application[]>(initialApplications);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [columnFilters, setColumnFilters] = useState(INITIAL_COLUMN_FILTERS);

  const [isViewOpen, setIsViewOpen] = useState(false);
  const [viewApp, setViewApp] = useState<Application | null>(null);
  const [isActionOpen, setIsActionOpen] = useState(false);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [actionType, setActionType] = useState<'approved' | 'rejected' | 'changes_required'>('approved');
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Application | null>(null);

  useEffect(() => {
    setApplications(initialApplications);
  }, [initialApplications]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (columnFilters.company.trim()) n++;
    if (columnFilters.substance.trim()) n++;
    if (columnFilters.quantity.min || columnFilters.quantity.max) n++;
    if (columnFilters.exportDate.from || columnFilters.exportDate.to) n++;
    if (columnFilters.issueDate.from || columnFilters.issueDate.to) n++;
    if (columnFilters.approveDate.from || columnFilters.approveDate.to) n++;
    if (columnFilters.certificateNumber.trim()) n++;
    return n;
  }, [columnFilters]);

  const filteredApplications = useMemo(() => {
    return applications.filter((app) => {
      if (statusFilter !== 'all') {
        const matchesTab =
          app.status === statusFilter ||
          (statusFilter === 'changes_required' &&
            (app.status === 'changes_required' || app.status === 'modification_requested'));
        if (!matchesTab) return false;
      }

      if (!matchesText(app.clients.company_name, columnFilters.company)) return false;

      const substanceHaystack = [
        app.chemicals.chemical_name,
        app.chemicals.cas_number,
        app.chemicals.ec_number || '',
        resolveTccApplicationRegistrationNumber(app) || '',
      ].join(' ');
      if (!matchesText(substanceHaystack, columnFilters.substance)) return false;

      if (
        !matchesNumberRange(
          app.quantity_mt,
          columnFilters.quantity.min,
          columnFilters.quantity.max
        )
      ) {
        return false;
      }

      if (
        !matchesDateRange(
          app.export_date,
          columnFilters.exportDate.from,
          columnFilters.exportDate.to
        )
      ) {
        return false;
      }

      if (
        !matchesDateRange(
          getIssueDate(app),
          columnFilters.issueDate.from,
          columnFilters.issueDate.to
        )
      ) {
        return false;
      }

      if (
        !matchesDateRange(
          getApproveDate(app),
          columnFilters.approveDate.from,
          columnFilters.approveDate.to
        )
      ) {
        return false;
      }

      if (!matchesText(getCertificateNumber(app) || '', columnFilters.certificateNumber)) {
        return false;
      }

      return true;
    });
  }, [applications, statusFilter, columnFilters]);

  const updateColumnFilter = <K extends keyof typeof INITIAL_COLUMN_FILTERS>(
    key: K,
    value: (typeof INITIAL_COLUMN_FILTERS)[K]
  ) => {
    setColumnFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearAllFilters = () => setColumnFilters(INITIAL_COLUMN_FILTERS);

  const filteredIds = useMemo(
    () => filteredApplications.map((app) => app.id),
    [filteredApplications]
  );

  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));

  const toggleSelection = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );
  };

  const toggleSelectAllFiltered = () => {
    setSelectedIds(allFilteredSelected ? [] : [...filteredIds]);
  };

  const handleOpenView = (app: Application) => {
    setViewApp(app);
    setIsViewOpen(true);
  };

  const handleOpenAction = (app: Application, type: 'approved' | 'rejected' | 'changes_required') => {
    if (!isEuReachFramework(app.regulatory_framework)) {
      toast.error('UK REACH and Turkey KKDIK requests are notification-only and are not reviewed here.');
      return;
    }
    setSelectedApp(app);
    setActionType(type);
    setRejectionReason('');
    setActionError(null);
    setIsActionOpen(true);
  };

  const handleViewThenAction = (type: 'approved' | 'rejected' | 'changes_required') => {
    if (!viewApp) return;
    setIsViewOpen(false);
    handleOpenAction(viewApp, type);
  };

  const handleProcessAction = () => {
    if (!selectedApp) return;
    setActionError(null);

    if (actionType !== 'approved' && !rejectionReason.trim()) {
      setActionError('A reason explanation is required for rejection/modification requests.');
      toast.error('A reason explanation is required for rejection/modification requests.');
      return;
    }

    startTransition(async () => {
      const res = await processTccAction(selectedApp.id, actionType, rejectionReason);
      if (res.success) {
        setIsActionOpen(false);
        if (actionType === 'approved' && res.certificateId) {
          toast.success('Certificate generated! Redirecting to preview...');
          router.push(`/admin/certificate-preview/${res.certificateId}`);
        } else {
          toast.success(res.message || 'Application processed.');
          router.refresh();
        }
      } else {
        setActionError(res.error || 'Failed to process application action.');
        toast.error(res.error || 'Failed to process application action.');
      }
    });
  };

  const handleDeleteApplication = () => {
    if (!deleteTarget) return;
    startTransition(async () => {
      const res = await deleteTccApplicationAction(deleteTarget.id);
      if (res.success) {
        toast.success(res.message || 'TCC application deleted.');
        setApplications((current) => current.filter((app) => app.id !== deleteTarget.id));
        setSelectedIds((current) => current.filter((id) => id !== deleteTarget.id));
        setDeleteTarget(null);
        if (viewApp?.id === deleteTarget.id) {
          setViewApp(null);
          setIsViewOpen(false);
        }
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to delete TCC application.');
      }
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <Badge variant="warning" className="flex items-center gap-1 w-fit">
            <Clock className="h-3 w-3" /> Pending Review
          </Badge>
        );
      case 'approved':
        return (
          <Badge variant="success" className="flex items-center gap-1 w-fit">
            <CheckCircle className="h-3 w-3" /> Approved
          </Badge>
        );
      case 'rejected':
        return (
          <Badge variant="danger" className="flex items-center gap-1 w-fit">
            <XCircle className="h-3 w-3" /> Rejected
          </Badge>
        );
      case 'changes_required':
      case 'modification_requested':
        return (
          <Badge variant="info" className="flex items-center gap-1 w-fit">
            <AlertTriangle className="h-3 w-3" /> Revision Needed
          </Badge>
        );
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-8 animate-slide-in">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">TCC Application Worklist</h1>
          <p className="text-sm text-slate-500 font-medium">
            Review company tonnage compliance certificate applications, allocate chemicals quota, and issue signed PDF permits.
          </p>
        </div>
        <TableDataExport
          filename="tcc-applications"
          columns={TCC_EXPORT_COLUMNS}
          filteredRows={filteredApplications}
          selectedIds={selectedIds}
          getRowId={(app) => app.id}
        />
      </div>

      {/* Status tabs */}
      <Card className="border-slate-100 shadow-xs">
        <CardContent className="p-2">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'all', label: 'All Permits' },
              { id: 'pending', label: 'Awaiting Action' },
              { id: 'approved', label: 'Issued / Approved' },
              { id: 'changes_required', label: 'Changes Required' },
              { id: 'rejected', label: 'Rejected' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  statusFilter === tab.id
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Main Table */}
      <Card className="border-slate-100 overflow-hidden">
        {(activeFilterCount > 0 || selectedIds.length > 0) && (
          <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/50 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-semibold text-slate-600">
              Showing {filteredApplications.length} of {applications.length} applications
              {activeFilterCount > 0 && (
                <span className="text-primary ml-1">
                  ({activeFilterCount} column filter{activeFilterCount !== 1 ? 's' : ''} active)
                </span>
              )}
              {selectedIds.length > 0 && (
                <span className="text-teal-700 ml-2">· {selectedIds.length} selected</span>
              )}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={clearAllFilters} className="h-8 text-xs">
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Clear column filters
            </Button>
          </div>
        )}
        <ResponsiveTableScroll>
          <table className="w-full text-left border-collapse min-w-[1280px] text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-100 align-top">
                <th className="p-3 w-12 text-center">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAllFiltered}
                    disabled={filteredIds.length === 0}
                    aria-label="Select all filtered TCC applications"
                    className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                  />
                </th>
                <th className="p-3 min-w-[150px]">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Company</span>
                  <TableColumnFilter
                    value={columnFilters.company}
                    onChange={(v) => updateColumnFilter('company', v)}
                    placeholder="Filter company…"
                  />
                </th>
                <th className="p-3 min-w-[180px]">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Substance</span>
                  <TableColumnFilter
                    value={columnFilters.substance}
                    onChange={(v) => updateColumnFilter('substance', v)}
                    placeholder="Name / CAS / Reg no…"
                  />
                </th>
                <th className="p-3 min-w-[110px]">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Quantity</span>
                  <TableNumberRangeFilter
                    value={columnFilters.quantity}
                    onChange={(v) => updateColumnFilter('quantity', v)}
                    unit="MT"
                  />
                </th>
                <th className="p-3 min-w-[130px]">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Export Date</span>
                  <TableDateRangeFilter
                    value={columnFilters.exportDate}
                    onChange={(v) => updateColumnFilter('exportDate', v)}
                  />
                </th>
                <th className="p-3 min-w-[130px]">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Issue Date</span>
                  <TableDateRangeFilter
                    value={columnFilters.issueDate}
                    onChange={(v) => updateColumnFilter('issueDate', v)}
                  />
                </th>
                <th className="p-3 min-w-[130px]">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Approve Date</span>
                  <TableDateRangeFilter
                    value={columnFilters.approveDate}
                    onChange={(v) => updateColumnFilter('approveDate', v)}
                  />
                </th>
                <th className="p-3 min-w-[150px]">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Certificate No.</span>
                  <TableColumnFilter
                    value={columnFilters.certificateNumber}
                    onChange={(v) => updateColumnFilter('certificateNumber', v)}
                    placeholder="TCC-2026-…"
                  />
                </th>
                <th className="p-3 min-w-[120px]">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Status</span>
                </th>
                <th className="p-3 min-w-[140px] text-xs font-bold text-slate-500 uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredApplications.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-400 font-medium">
                    No applications match the selected status and column filters.
                  </td>
                </tr>
              ) : (
                filteredApplications.map((app) => {
                  const cert = resolveCertificate(app);
                  const issueDate = getIssueDate(app);
                  const approveDate = getApproveDate(app);
                  const registrationNumber = resolveTccApplicationRegistrationNumber(app);

                  const isSelected = selectedIds.includes(app.id);

                  return (
                    <tr
                      key={app.id}
                      className={`hover:bg-slate-50/50 transition-colors group ${isSelected ? 'bg-teal-50/40' : ''}`}
                    >
                      <td className="p-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelection(app.id)}
                          aria-label={`Select ${app.clients.company_name}`}
                          className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                        />
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-emerald-50 text-primary flex items-center justify-center font-bold shrink-0">
                            <Building className="h-4 w-4" />
                          </div>
                          <div>
                            <Link
                              href={`/admin/clients/${app.client_id}`}
                              className="font-bold text-slate-800 hover:text-primary transition-colors hover:underline block"
                            >
                              {app.clients.company_name}
                            </Link>
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                              Submitted: {formatDisplayDate(app.created_at)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <FlaskConical className="h-4 w-4 text-slate-400 shrink-0" />
                          <div>
                            <div className="font-bold text-slate-700">{app.chemicals.chemical_name}</div>
                            <div className="text-xs text-slate-400 font-medium">
                              CAS: {app.chemicals.cas_number}
                              <br />
                              {app.chemicals.ec_number ? `EC: ${app.chemicals.ec_number}` : ''}
                              {registrationNumber ? (
                                <>
                                  <br />
                                  Reg: {registrationNumber}
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 font-extrabold text-slate-800">{app.quantity_mt} MT</td>
                      <td className="p-4 text-slate-600 font-medium text-xs">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          {formatDisplayDate(app.export_date)}
                        </div>
                      </td>
                      <td className="p-4 text-slate-600 font-medium text-xs">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          {formatDisplayDate(issueDate)}
                        </div>
                      </td>
                      <td className="p-4 text-slate-600 font-medium text-xs">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                          {formatDisplayDate(approveDate)}
                        </div>
                      </td>
                      <td className="p-4 font-mono text-xs text-emerald-700 font-bold">
                        {getCertificateNumber(app) || '—'}
                      </td>
                      <td className="p-4">
                        <div className="space-y-1">
                          {getStatusBadge(app.status)}
                          {app.status !== 'approved' && app.rejection_reason && (
                            <div className="text-xs font-semibold text-slate-400 bg-slate-50 p-1.5 rounded-md border border-slate-100 max-w-xs flex gap-1 items-start">
                              <MessageSquare className="h-3 w-3 mt-0.5 text-slate-500 shrink-0" />
                              <span className="line-clamp-2">{app.rejection_reason}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenView(app)}
                            className="h-8 border-slate-200"
                          >
                            <Eye className="h-3.5 w-3.5 mr-1.5" />
                            View
                          </Button>
                          {app.status === 'approved' && cert?.id && (
                            <CertificatePdfDownloadLink
                              pdfUrl={buildTccCertificatePdfDownloadUrl(cert.id)}
                              docxUrl=""
                              fileName={`${cert.certificate_number}.pdf`}
                              certificateType="tcc"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 h-8 text-xs font-bold text-primary hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100/50 rounded-md transition-colors border border-emerald-100 disabled:opacity-60"
                            >
                              <Download className="h-3.5 w-3.5" />
                              PDF
                            </CertificatePdfDownloadLink>
                          )}
                          {isAwaitingReview(app.status) && (
                            <Badge variant="warning" className="text-[10px] py-0.5">
                              Review in View
                            </Badge>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteTarget(app)}
                            className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50"
                            title="Delete application"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </ResponsiveTableScroll>
      </Card>

      <TccApplicationViewDialog
        app={viewApp}
        isOpen={isViewOpen}
        onClose={() => setIsViewOpen(false)}
        getStatusBadge={getStatusBadge}
        onApprove={() => handleViewThenAction('approved')}
        onReject={() => handleViewThenAction('rejected')}
        onRequestChanges={() => handleViewThenAction('changes_required')}
        allowAdminEdit
        onApplicationUpdated={(updates) => {
          setViewApp((prev) => (prev ? ({ ...prev, ...updates } as Application) : prev));
        }}
        emailDefaults={emailDefaults}
      />

      <Dialog
        isOpen={isActionOpen}
        onClose={() => setIsActionOpen(false)}
        title={
          actionType === 'approved'
            ? 'Confirm Approval & Issue Certificate'
            : actionType === 'rejected'
            ? 'Reject Application'
            : 'Request Application Revisions'
        }
      >
        <div className="space-y-4">
          {actionType === 'approved' ? (
            <>
              <p className="text-sm text-slate-600 font-medium leading-relaxed">
                Are you sure you want to approve this application from{' '}
                <span className="font-bold text-slate-800">{selectedApp?.clients.company_name}</span>?
              </p>
              <div className="bg-slate-50 border rounded-lg p-3 text-xs space-y-1.5 text-slate-600 font-medium">
                <div>
                  <span className="font-bold text-slate-400 uppercase tracking-wider block text-[9px]">Substance</span>
                  <span className="font-bold text-slate-800">{selectedApp?.chemicals.chemical_name}</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="font-bold text-slate-400 uppercase tracking-wider block text-[9px]">Requested</span>
                    <span className="font-bold text-slate-800">{selectedApp?.quantity_mt} MT</span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-400 uppercase tracking-wider block text-[9px]">Available Quota</span>
                    <span className="font-bold text-slate-800">
                      {selectedApp ? getTccApplicationAvailableQuota(selectedApp) : 0} MT
                    </span>
                    {selectedApp?.rc_period_certificate && (
                      <span className="block text-[10px] text-slate-500 font-medium mt-0.5">
                        RC period: {selectedApp.rc_period_certificate}
                      </span>
                    )}
                  </div>
                </div>
                {selectedApp?.bo_attachment_url && (
                  <a
                    href={selectedApp.bo_attachment_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
                  >
                    <Download className="h-3.5 w-3.5" />
                    View PO: {selectedApp.bo_attachment_name || 'Attachment'}
                  </a>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Approving will deduct client quota, generate the PDF certificate, and store it for download.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600 font-medium">
                Please specify the reason for this action. This feedback will be sent to the client.
              </p>
              <textarea
                rows={4}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder={
                  actionType === 'rejected'
                    ? 'Reason for rejection…'
                    : 'Detail the modifications needed…'
                }
                className="w-full text-sm p-3 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none font-medium text-slate-700"
                required
              />
            </>
          )}

          {actionError && (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-sm font-semibold flex items-start gap-2.5">
              <AlertCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold mb-1">Decision Error</h4>
                <p className="text-xs leading-relaxed font-medium">{actionError}</p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsActionOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleProcessAction}
              isLoading={isPending}
              disabled={isPending}
              className={
                actionType === 'approved'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : actionType === 'rejected'
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : 'bg-amber-600 hover:bg-amber-700 text-white'
              }
            >
              {actionType === 'approved'
                ? 'Approve & Issue Certificate'
                : actionType === 'rejected'
                ? 'Reject Permit'
                : 'Send Revision Request'}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete TCC Application"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Permanently delete the TCC application from{' '}
            <strong>{deleteTarget?.clients.company_name}</strong> for{' '}
            <strong>{deleteTarget?.chemicals.chemical_name}</strong>
            {deleteTarget && getCertificateNumber(deleteTarget) ? (
              <>
                {' '}
                (certificate{' '}
                <strong className="font-mono">{getCertificateNumber(deleteTarget)}</strong>)
              </>
            ) : null}
            ? This cannot be undone.
          </p>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteApplication}
              isLoading={isPending}
              disabled={isPending}
            >
              Delete Application
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
