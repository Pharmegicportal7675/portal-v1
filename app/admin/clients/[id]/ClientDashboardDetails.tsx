'use client';

import { useState, useTransition, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  changeClientEmailAction, 
  changeClientPasswordAction, 
  toggleClientLoginAction, 
  addNewChemicalToClientAction,
  removeChemicalFromClientAction,
  restoreClientChemicalAction,
  permanentDeleteClientChemicalAction,
  editClientChemicalAction,
  addContactAction, 
  deleteContactAction, 
  addInternalNoteAction, 
  deleteInternalNoteAction,
  deleteClientAction,
} from '@/actions/clients';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { DatePicker } from '@/components/ui/DatePicker';
import { Select } from '@/components/ui/Select';
import { YearPicker } from '@/components/ui/YearPicker';
import { Dialog } from '@/components/ui/Dialog';
import { ModalErrorBox } from '@/components/ui/ModalErrorBox';
import { FormLabel } from '@/components/ui/FormLabel';
import { formatErrorMessage } from '@/lib/format-error';
import { resolveQuotaConsumption, sumApprovedExports, sumApprovedExportsInReachWindow, getRemainingQuota, getTonnageBandMaxQuota, getReachCertAllocatedQuota, resolveDisplayedTonnageBand } from '@/lib/quota';
import { computeTccApplicationRcQuota } from '@/lib/tcc-application-quota';
import {
  isActiveReachCertificate,
  mapLatestReachByChemical,
  mapAllReachByChemical,
  getReachCertificateYear,
  isReachCertificateType,
  getReachCertsForClientChemical,
  findReachCertificatePeriodConflict,
  findReachCertificateYearConflict,
  isLatestReachCertificate,
  REACH_CERTIFICATE_TYPE,
  getReachCertificateStatus,
  getSubstanceRcBadgeStatus,
  canRenewReachForChemical,
  hasNewerReachCertificate,
  getFirstDateOfYear,
  getLastDateOfYear,
  getTodayDateString,
  getDefaultReachPeriodForYear,
  suggestRenewCertificateDates,
  buildRcCertificateYearOptions,
  getRcCertificateYearRange,
} from '@/lib/reach-certificate';
import { buildRcChemicalSummaries, buildRcHistoryRows, type RcChemicalSummaryRow } from '@/lib/rc-chemical-summary';
import { canManageAdminRecords } from '@/lib/auth/roles';
import {
  clientHasEuReachRegistration,
  normalizeRegulatoryRegistrations,
} from '@/lib/regulatory-registrations';
import {
  deleteReachCertificateAction,
  renewReachCertificateAction,
  updateReachCertificateAction,
  sendBulkReachCertificatesEmailAction,
  issueReachCertificateWithDetailsAction,
} from '@/actions/reach';
import {
  buildReachCertificateDocxPreviewUrl,
  buildReachCertificatePdfDownloadUrl,
} from '@/lib/reach-certificate-download';
import {
  buildTccCertificatePdfDownloadUrl,
} from '@/lib/tcc-certificate-download';
import { CertificatePdfDownloadLink } from '@/components/CertificatePdfDownloadLink';
import { TableDataExport } from '@/components/TableDataExport';
import { ResponsiveTableScroll } from '@/components/ui/ResponsiveTableScroll';
import { formatDisplayDate } from '@/lib/date-filter';
import type { CsvColumn } from '@/lib/export-csv';
import { processTccAction } from '@/actions/tcc';
import { canClientEditTccApplication } from '@/lib/tcc-application';
import type { TccEmailDefaults, TccViewApplication } from '@/components/TccApplicationViewDialog';
import { toast } from '@/store/toast';
import Link from 'next/link';
import { 
  Building, Mail, Phone, MapPin, Calendar, CheckCircle, 
  AlertCircle, FileText, User, ShieldAlert, Key, Plus, Trash2,
  FileSignature, Award, Clipboard, StickyNote, History, Lock, Unlock,
  Download, Eye, EyeOff, PenLine, RotateCcw, Clock, XCircle
} from 'lucide-react';
import { useLayoutStore } from '@/store/layout';
import dynamic from 'next/dynamic';

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

const RcCertificatesTable = dynamic(() => import('@/components/RcCertificatesTable'), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-xl bg-slate-100" />,
});

const TccApplicationViewDialog = dynamic(
  () =>
    import('@/components/TccApplicationViewDialog').then((mod) => ({
      default: mod.TccApplicationViewDialog,
    })),
  { ssr: false }
);

interface ClientDashboardDetailsProps {
  client: any;
  user: any;
  clientChemicals: any[];
  allChemicals: any[];
  contacts: any[];
  tccHistory: any[];
  certificates: any[];
  activityLogs: any[];
  internalNotes: any[];
  currentUserId: string;
  currentUserRole: string;
  emailDefaults?: TccEmailDefaults;
  viewMode?: 'overview' | 'chemicals' | 'certificates' | 'rc-certificates';
}

export default function ClientDashboardDetails({
  client,
  user,
  clientChemicals: allClientChemicals,
  allChemicals,
  contacts,
  tccHistory,
  certificates,
  activityLogs,
  internalNotes,
  currentUserId,
  currentUserRole,
  emailDefaults,
  viewMode = 'overview',
}: ClientDashboardDetailsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const setCustomBreadcrumb = useLayoutStore((state) => state.setCustomBreadcrumb);

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    setCustomBreadcrumb(client.company_name);
    return () => setCustomBreadcrumb(null);
  }, [client.company_name, setCustomBreadcrumb]);

  const showOverview = viewMode === 'overview';
  const showChemicalsSection = viewMode === 'overview' || viewMode === 'chemicals';
  const showCertificatesSection = viewMode === 'overview' || viewMode === 'certificates';
  const showRcCertificatesSection = viewMode === 'rc-certificates';
  const showAdminExtras = viewMode === 'overview' && currentUserRole !== 'CLIENT';

  const clientChemicals = allClientChemicals.filter((c) => c.status !== 'trashed');
  const trashedChemicals = allClientChemicals.filter((c) => c.status === 'trashed');

  const rcCertificates = useMemo(
    () => (certificates || []).filter((c) => isReachCertificateType(c)),
    [certificates]
  );

  const rcListRows = useMemo(() => {
    const issued = rcCertificates.map((cert) => ({ kind: 'issued' as const, cert }));
    const chemicalIdsWithCert = new Set(
      issued.map((row) => row.cert.chemical_id).filter(Boolean)
    );
    const pending = clientChemicals
      .filter((cc) => !chemicalIdsWithCert.has(cc.chemical_id))
      .map((cc) => ({
        kind: 'pending' as const,
        chemicalId: cc.chemical_id,
        chemical: cc.chemicals,
      }));

    const all = [...issued, ...pending];
    all.sort((a, b) => {
      const nameA =
        a.kind === 'issued'
          ? a.cert.chemicals?.chemical_name || a.cert.chemical?.chemical_name || ''
          : a.chemical?.chemical_name || '';
      const nameB =
        b.kind === 'issued'
          ? b.cert.chemicals?.chemical_name || b.cert.chemical?.chemical_name || ''
          : b.chemical?.chemical_name || '';
      return nameA.localeCompare(nameB);
    });
    return all;
  }, [rcCertificates, clientChemicals]);

  const pageTitle =
    viewMode === 'chemicals'
      ? `${client.company_name} — Substance Inventory`
      : viewMode === 'certificates'
        ? `${client.company_name} — TCC Certificates`
        : viewMode === 'rc-certificates'
          ? `${client.company_name} — RC Certificates`
          : `${client.company_name} Details`;

  const reachByChemical = useMemo(
    () => mapLatestReachByChemical(certificates || []),
    [certificates]
  );

  const reachAllByChemical = useMemo(
    () => mapAllReachByChemical(certificates || []),
    [certificates]
  );

  const rcChemicalSummaryRows = useMemo(
    () =>
      buildRcChemicalSummaries(
        clientChemicals,
        (certificates || []) as import('@/lib/reach-certificate').ReachCertificateRecord[],
        tccHistory
      ),
    [clientChemicals, certificates, tccHistory]
  );

  const rcYearOptions = useMemo(() => buildRcCertificateYearOptions(), []);

  const emptyAssignChemData = () => {
    const year = new Date().getFullYear();
    const period = getDefaultReachPeriodForYear(year);
    return {
      chemical_name: '',
      cas_number: '',
      ec_number: '',
      tonnage_band: '',
      available_quantity: '',
      registration_number: '',
      certificate_year: String(year),
      issued_date: period.issuedDate,
      validated_date: period.validatedDate,
      validity_date: period.validatedDate,
      allocated_quantity: '',
      target_chemical_id: 'new_substance',
    };
  };

  const [assignChemData, setAssignChemData] = useState(emptyAssignChemData);

  const availableRcYearOptions = useMemo(() => {
    const allYears = getRcCertificateYearRange();

    const chemId = assignChemData.target_chemical_id;
    if (!chemId || chemId === 'new_substance') {
      return allYears.map((year) => ({ value: String(year), label: String(year) }));
    }

    const ccRow = clientChemicals.find((c) => c.chemical_id === chemId);
    const siblingCerts = getReachCertsForClientChemical(
      certificates || [],
      chemId,
      ccRow?.chemicals?.cas_number,
      ccRow?.registration_number,
      ccRow?.certificate_number
    );
    const issuedYears = new Set(
      siblingCerts
        .map((c) => getReachCertificateYear(c.issued_at))
        .filter((y): y is number => y != null)
    );

    const available = allYears.filter((y) => !issuedYears.has(y));
    return available.map((year) => ({ value: String(year), label: String(year) }));
  }, [assignChemData.target_chemical_id, certificates, clientChemicals]);

  // Modals state
  const [isEmailModalOpen, setEmailModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState(client.email);
  const [isPasswordModalOpen, setPasswordModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [isAssignChemModalOpen, setAssignChemModalOpen] = useState(false);
  const [assignChemModalMode, setAssignChemModalMode] = useState<'assign' | 'issue'>('assign');
  const [isRcCertModalOpen, setRcCertModalOpen] = useState(false);
  const [isEditSubstanceModalOpen, setEditSubstanceModalOpen] = useState(false);
  const [rcHistoryTarget, setRcHistoryTarget] = useState<RcChemicalSummaryRow | null>(null);
  const [rcCertFormMode, setRcCertFormMode] = useState<'renew' | 'edit'>('renew');
  const [renewChemicalId, setRenewChemicalId] = useState('');
  const [editingCertId, setEditingCertId] = useState<string | null>(null);
  const [editSubstanceData, setEditSubstanceData] = useState({
    chemical_id: '',
    chemical_name: '',
    cas_number: '',
    ec_number: '',
    tonnage_band: '',
    validity_date: '',
  });

  const [isContactModalOpen, setContactModalOpen] = useState(false);
  const [contactData, setContactData] = useState({
    first_name: '', last_name: '', email: '', phone: '', role: ''
  });
  const [isNoteModalOpen, setNoteModalOpen] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [isDeleteClientOpen, setDeleteClientOpen] = useState(false);
  const [rcDeleteTarget, setRcDeleteTarget] = useState<
    | { kind: 'issued'; id: string; certificate_number: string; chemical_name: string }
    | { kind: 'pending'; chemicalId: string; chemical_name: string }
    | null
  >(null);
  const [selectedRcCertIds, setSelectedRcCertIds] = useState<string[]>([]);
  const [selectedTccAppIds, setSelectedTccAppIds] = useState<string[]>([]);

  const minIssuedDate = useMemo(() => {
    if (!assignChemData.certificate_year) return undefined;
    return `${assignChemData.certificate_year}-01-01`;
  }, [assignChemData.certificate_year]);

  const maxIssuedDate = useMemo(() => {
    if (!assignChemData.certificate_year) return undefined;
    return `${assignChemData.certificate_year}-12-31`;
  }, [assignChemData.certificate_year]);

  const minValidatedDate = useMemo(() => {
    return assignChemData.issued_date || undefined;
  }, [assignChemData.issued_date]);

  const maxValidatedDate = useMemo(() => {
    if (!assignChemData.certificate_year) return undefined;
    return `${assignChemData.certificate_year}-12-31`;
  }, [assignChemData.certificate_year]);

  const rcHistoryRows = useMemo(() => {
    if (!rcHistoryTarget) return [];
    return buildRcHistoryRows(rcHistoryTarget, tccHistory);
  }, [rcHistoryTarget, tccHistory]);

  const issuedRcCertIds = useMemo(
    () =>
      rcListRows
        .filter((row): row is { kind: 'issued'; cert: { id: string } } => row.kind === 'issued')
        .map((row) => row.cert.id),
    [rcListRows]
  );

  const allIssuedRcSelected =
    issuedRcCertIds.length > 0 && issuedRcCertIds.every((id) => selectedRcCertIds.includes(id));

  const toggleRcCertSelection = (certificateId: string) => {
    setSelectedRcCertIds((current) =>
      current.includes(certificateId)
        ? current.filter((id) => id !== certificateId)
        : [...current, certificateId]
    );
  };

  const toggleAllIssuedRcSelection = () => {
    setSelectedRcCertIds(allIssuedRcSelected ? [] : [...issuedRcCertIds]);
  };

  const rcExportRows = useMemo(
    () => rcListRows.filter((row) => row.kind === 'issued').map((row) => row.cert),
    [rcListRows]
  );

  const RC_CLIENT_EXPORT_COLUMNS: CsvColumn<(typeof rcExportRows)[number]>[] = [
    { header: 'Company', value: () => client.company_name },
    { header: 'Certificate No.', value: (cert) => cert.certificate_number },
    { header: 'Registration No.', value: (cert) => cert.registration_number },
    {
      header: 'Substance',
      value: (cert) => cert.chemicals?.chemical_name || cert.chemical?.chemical_name,
    },
    {
      header: 'CAS Number',
      value: (cert) => cert.chemicals?.cas_number || cert.chemical?.cas_number,
    },
    { header: 'Issued Date', value: (cert) => formatDisplayDate(cert.issued_at) },
    { header: 'Validated Date', value: (cert) => formatDisplayDate(cert.expires_at) },
    {
      header: 'Status',
      value: (cert) => (isActiveReachCertificate(cert) ? 'Valid' : getReachCertificateStatus(cert)),
    },
    { header: 'Mail Sent', value: (cert) => (cert.mail_sent ? 'Yes' : 'No') },
  ];

  const allTccSelected =
    tccHistory.length > 0 && tccHistory.every((app) => selectedTccAppIds.includes(app.id));

  const toggleTccSelection = (id: string) => {
    setSelectedTccAppIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );
  };

  const toggleAllTccSelection = () => {
    setSelectedTccAppIds(allTccSelected ? [] : tccHistory.map((app) => app.id));
  };

  const TCC_CLIENT_EXPORT_COLUMNS: CsvColumn<(typeof tccHistory)[number]>[] = [
    { header: 'Company', value: () => client.company_name },
    {
      header: 'Certificate No.',
      value: (app) => resolveTccCertificateNumber(app) || '',
    },
    {
      header: 'Substance',
      value: (app) => app.chemicals?.chemical_name || 'N/A',
    },
    { header: 'Quantity (MT)', value: (app) => app.quantity_mt },
    { header: 'Registration Number', value: (app) => app.registration_number },
    { header: 'Submitted', value: (app) => formatDisplayDate(app.created_at) },
    { header: 'Export Date', value: (app) => formatDisplayDate(app.export_date) },
    { header: 'Status', value: (app) => app.status },
  ];

  const [isTccViewOpen, setIsTccViewOpen] = useState(false);
  const [viewTccApp, setViewTccApp] = useState<TccViewApplication | null>(null);
  const [isTccActionOpen, setIsTccActionOpen] = useState(false);
  const [selectedTccApp, setSelectedTccApp] = useState<TccViewApplication | null>(null);
  const [tccActionType, setTccActionType] = useState<'approved' | 'rejected' | 'changes_required'>('approved');
  const [tccRejectionReason, setTccRejectionReason] = useState('');
  const [tccActionError, setTccActionError] = useState<string | null>(null);
  const canReviewTcc = currentUserRole !== 'CLIENT';
  const canManageRc = canManageAdminRecords(currentUserRole);
  const hasEuReach = clientHasEuReachRegistration(client.regulatory_registrations);
  const hasAnyRegulatoryRegistration =
    normalizeRegulatoryRegistrations(client.regulatory_registrations).length > 0;
  const canIssueRc = canManageRc && hasEuReach;
  const canDeleteClient = canManageRc;

  type ModalErrorKey =
    | 'email'
    | 'password'
    | 'assignChem'
    | 'contact'
    | 'note'
    | 'security'
    | 'substances';
  const [modalErrors, setModalErrors] = useState<Record<ModalErrorKey, string | null>>({
    email: null,
    password: null,
    assignChem: null,
    contact: null,
    note: null,
    security: null,
    substances: null,
  });

  const setModalError = (key: ModalErrorKey, message: string | null) => {
    setModalErrors((prev) => ({ ...prev, [key]: message }));
  };

  const toErrorMessage = (err: unknown, fallback = 'Something went wrong.') => {
    if (typeof err === 'string' && err.trim()) return err;
    const formatted = formatErrorMessage(err);
    return formatted === 'An unexpected error occurred.' ? fallback : formatted;
  };

  // -------------------------------------------------------------
  // Data Calculations
  // -------------------------------------------------------------
  const activePermissions = clientChemicals.filter(c => c.status === 'active').length;
  const pendingRenewals = clientChemicals.filter(c => c.status === 'expired' || (c.validity_date && new Date(c.validity_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))).length;

  const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const CHART_COLORS = [
    '#0f766e',
    '#2563eb',
    '#d97706',
    '#e11d48',
    '#7c3aed',
    '#ea580c',
    '#0891b2',
    '#4f46e5',
    '#65a30d',
    '#db2777',
  ];
  const chartYear = new Date().getFullYear();

  const activityYears = useMemo(() => {
    const approvedApps = tccHistory.filter((t) => t.status === 'approved');
    const years = new Set<number>();
    approvedApps.forEach((app) => {
      const raw = app.export_date || app.updated_at || app.created_at;
      if (!raw) return;
      years.add(new Date(raw).getFullYear());
    });
    const sorted = Array.from(years).sort((a, b) => a - b);
    return sorted.length > 0 ? sorted : [chartYear];
  }, [tccHistory, chartYear]);

  const [selectedChartYears, setSelectedChartYears] = useState<number[]>([]);

  useEffect(() => {
    setSelectedChartYears((prev) => {
      if (activityYears.length === 0) return prev;
      if (prev.length === 0) return activityYears;
      const kept = prev.filter((y) => activityYears.includes(y));
      const added = activityYears.filter((y) => !prev.includes(y));
      const merged = [...kept, ...added].sort((a, b) => a - b);
      return merged.length > 0 ? merged : activityYears;
    });
  }, [activityYears]);

  const { chartSeries, chartOptions, chartLegend } = useMemo(() => {
    const approvedApps = tccHistory.filter((t) => t.status === 'approved');
    const yearsToShow = selectedChartYears.length > 0 ? selectedChartYears : activityYears;

    const chemicalEntries: { id: string; name: string }[] = [];
    const seen = new Set<string>();
    clientChemicals.forEach((cc) => {
      if (cc.chemical_id && cc.chemicals?.chemical_name && !seen.has(cc.chemical_id)) {
        seen.add(cc.chemical_id);
        chemicalEntries.push({ id: cc.chemical_id, name: cc.chemicals.chemical_name });
      }
    });
    approvedApps.forEach((app) => {
      const id = app.chemical_id as string;
      const name = app.chemicals?.chemical_name || 'Unknown substance';
      if (id && !seen.has(id)) {
        seen.add(id);
        chemicalEntries.push({ id, name });
      }
    });

    const getActivityDate = (app: { export_date?: string | null; updated_at?: string; created_at?: string }) => {
      const raw = app.export_date || app.updated_at || app.created_at;
      return raw ? new Date(raw) : null;
    };

    const multiYear = yearsToShow.length > 1;
    const series: { name: string; color: string; data: number[] }[] = [];
    let colorIdx = 0;

    for (const year of yearsToShow) {
      for (const { id, name } of chemicalEntries) {
        const data = MONTH_LABELS.map((_, monthIdx) =>
          approvedApps
            .filter((app) => app.chemical_id === id)
            .filter((app) => {
              const d = getActivityDate(app);
              return d && d.getFullYear() === year && d.getMonth() === monthIdx;
            })
            .reduce((sum, app) => sum + Number(app.quantity_mt || 0), 0)
        );
        const total = data.reduce((a, b) => a + b, 0);
        if (total <= 0) continue;

        series.push({
          name: multiYear ? `${name} (${year})` : name,
          color: CHART_COLORS[colorIdx % CHART_COLORS.length],
          data,
        });
        colorIdx += 1;
      }
    }

    const legend = series.map((s, idx) => ({
      name: s.name,
      color: CHART_COLORS[idx % CHART_COLORS.length],
      total: s.data.reduce((a, b) => a + b, 0),
    }));

    const seriesColors = series.map((s) => s.color);

    const options = {
      chart: {
        type: 'line' as const,
        toolbar: { show: false },
        zoom: { enabled: false },
        animations: { enabled: true },
      },
      dataLabels: { enabled: false },
      stroke: { curve: 'smooth' as const, width: 3 },
      colors: seriesColors,
      markers: {
        size: 4,
        strokeWidth: 2,
        hover: { size: 6 },
      },
      xaxis: {
        categories: MONTH_LABELS,
        labels: { style: { fontSize: '11px', colors: '#64748b', fontWeight: 600 } },
      },
      yaxis: {
        title: { text: 'Exported (MT)', style: { fontSize: '11px', color: '#64748b', fontWeight: 600 } },
        labels: {
          formatter: (v: number) => `${Number(v).toFixed(0)}`,
          style: { fontSize: '10px', colors: '#64748b' },
        },
        min: 0,
      },
      grid: { borderColor: '#f1f5f9', strokeDashArray: 4 },
      legend: { show: false },
      tooltip: {
        shared: true,
        intersect: false,
        y: { formatter: (v: number) => `${Number(v).toFixed(2)} MT` },
      },
    };

    return {
      chartSeries: series.length > 0 ? series.map(({ name, data }) => ({ name, data })) : [],
      chartOptions: options,
      chartLegend: legend,
    };
  }, [tccHistory, clientChemicals, activityYears, selectedChartYears]);

  // -------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------
  const handleEmailChange = () => {
    if (!newEmail) {
      setModalError('email', 'Email is required.');
      return;
    }
    setModalError('email', null);
    startTransition(async () => {
      const res = await changeClientEmailAction(client.id, newEmail);
      if (res.success) {
        toast.success('Email updated.');
        setEmailModalOpen(false);
        router.refresh();
      } else {
        setModalError('email', toErrorMessage(res.error, 'Failed to update email.'));
      }
    });
  };
  const handlePasswordChange = () => {
    if (newPassword.length < 6) {
      setModalError('password', 'Password must be at least 6 characters.');
      return;
    }
    setModalError('password', null);
    startTransition(async () => {
      const res = await changeClientPasswordAction(client.id, newPassword);
      if (res.success) {
        toast.success('Password updated.');
        setPasswordModalOpen(false);
        setNewPassword('');
        router.refresh();
      } else {
        setModalError('password', toErrorMessage(res.error, 'Failed to update password.'));
      }
    });
  };
  const handleToggleLogin = () => {
    setModalError('security', null);
    startTransition(async () => {
      const res = await toggleClientLoginAction(client.id, !user?.is_disabled);
      if (res.success) {
        toast.success('Login toggled.');
        router.refresh();
      } else {
        setModalError('security', toErrorMessage(res.error, 'Failed to update login status.'));
      }
    });
  };
  const closeAssignChemModal = () => {
    setAssignChemModalOpen(false);
    setAssignChemModalMode('assign');
    setModalError('assignChem', null);
    setAssignChemData(emptyAssignChemData());
  };

  const closeRcCertModal = () => {
    setRcCertModalOpen(false);
    setModalError('assignChem', null);
    setAssignChemData(emptyAssignChemData());
    setRcCertFormMode('renew');
    setRenewChemicalId('');
    setEditingCertId(null);
  };

  type ClientChemRow = {
    chemical_id: string;
    validity_date?: string | null;
    registration_number?: string | null;
    issued_date?: string | null;
    certificate_number?: string | null;
    created_at?: string | null;
    chemicals?: {
      chemical_name?: string;
      cas_number?: string | null;
      ec_number?: string | null;
      tonnage_band?: string | null;
    };
  };

  const toDateInputValue = (value: string | null | undefined, fallback: string) => {
    if (!value?.trim()) return fallback;
    return value.trim().split('T')[0];
  };

  const buildSubstanceFormFromClientChem = (cc: ClientChemRow, certId?: string | null, forRenew = false) => {
    const allCerts = getReachCertsForClientChemical(
      certificates || [],
      cc.chemical_id,
      cc.chemicals?.cas_number,
      cc.registration_number,
      cc.certificate_number
    );
    const targetRc =
      (certId ? allCerts.find((c) => c.id === certId) : undefined) ?? allCerts[0] ?? null;
    const validityFallback = toDateInputValue(cc.validity_date, getLastDateOfYear());
    const renewDates = forRenew
      ? suggestRenewCertificateDates(targetRc, cc.validity_date)
      : null;

    const issuedDate = renewDates
      ? renewDates.issuedDate
      : toDateInputValue(
          targetRc?.issued_at,
          toDateInputValue(cc.issued_date, toDateInputValue(cc.created_at, getTodayDateString()))
        );
    const validatedDate = renewDates
      ? renewDates.validatedDate
      : toDateInputValue(targetRc?.expires_at, validityFallback);

    return {
      chemical_name: cc.chemicals?.chemical_name || '',
      cas_number: cc.chemicals?.cas_number || '',
      ec_number: cc.chemicals?.ec_number || '',
      tonnage_band: cc.chemicals?.tonnage_band || '',
      registration_number:
        targetRc?.registration_number?.trim() || cc.registration_number?.trim() || '',
      certificate_year: String(getReachCertificateYear(issuedDate) ?? new Date().getFullYear()),
      issued_date: issuedDate,
      validated_date: validatedDate,
      validity_date: validatedDate,
      available_quantity: '',
      allocated_quantity: targetRc
        ? String(getReachCertAllocatedQuota(targetRc, cc.chemicals?.tonnage_band))
        : cc.chemicals?.tonnage_band
          ? String(getTonnageBandMaxQuota(cc.chemicals.tonnage_band) ?? '')
          : '',
      target_chemical_id: cc.chemical_id,
    };
  };

  const openEditSubstanceModal = (cc: ClientChemRow) => {
    setModalError('substances', null);
    setEditSubstanceData({
      chemical_id: cc.chemical_id,
      chemical_name: cc.chemicals?.chemical_name || '',
      cas_number: cc.chemicals?.cas_number || '',
      ec_number: cc.chemicals?.ec_number || '',
      tonnage_band: cc.chemicals?.tonnage_band || '',
      validity_date: cc.validity_date?.trim().split('T')[0] || '',
    });
    setEditSubstanceModalOpen(true);
  };

  const handleEditSubstanceAllocation = () => {
    if (!editSubstanceData.chemical_name.trim()) {
      setModalError('substances', 'Substance name is required.');
      return;
    }
    if (!editSubstanceData.ec_number.trim()) {
      setModalError('substances', 'EC number is required.');
      return;
    }
    setModalError('substances', null);
    startTransition(async () => {
      const res = await editClientChemicalAction(client.id, editSubstanceData.chemical_id, {
        chemical_name: editSubstanceData.chemical_name,
        cas_number: editSubstanceData.cas_number,
        ec_number: editSubstanceData.ec_number,
        tonnage_band: editSubstanceData.tonnage_band,
        validity_date: editSubstanceData.validity_date || null,
        update_global_tonnage_band: true,
      });
      if (res.success) {
        toast.success(res.message || 'Substance allocation updated.');
        setEditSubstanceModalOpen(false);
        router.refresh();
      } else {
        setModalError('substances', toErrorMessage(res.error, 'Failed to update substance.'));
      }
    });
  };

  const findClientChemRow = (chemicalId: string) =>
    clientChemicals.find((c) => c.chemical_id === chemicalId);

  const handleAssignYearChange = (yearValue: string) => {
    const year = Number(yearValue);
    if (Number.isNaN(year)) return;
    const period = getDefaultReachPeriodForYear(year);
    setAssignChemData((current) => ({
      ...current,
      certificate_year: yearValue,
      issued_date: period.issuedDate,
      validated_date: period.validatedDate,
      validity_date: period.validatedDate,
    }));
  };

  const handleChemicalSelectChange = (chemId: string) => {
    if (chemId === 'new_substance') {
      setAssignChemData({
        ...emptyAssignChemData(),
        target_chemical_id: 'new_substance',
      });
      return;
    }

    const cc = clientChemicals.find((c) => c.chemical_id === chemId);
    if (!cc) return;

    const current = new Date().getFullYear();
    const allYears = getRcCertificateYearRange();
    const siblingCerts = getReachCertsForClientChemical(
      certificates || [],
      chemId,
      cc.chemicals?.cas_number,
      cc.registration_number,
      cc.certificate_number
    );
    const issuedYears = new Set(
      siblingCerts
        .map((c) => getReachCertificateYear(c.issued_at))
        .filter((y): y is number => y != null)
    );
    const availableYears = allYears.filter((y) => !issuedYears.has(y));

    let targetYear = Number(assignChemData.certificate_year);
    if (issuedYears.has(targetYear)) {
      targetYear = availableYears.length > 0 ? availableYears[0] : current;
    }

    const period = getDefaultReachPeriodForYear(targetYear);
    const bandMax = getTonnageBandMaxQuota(cc.chemicals?.tonnage_band);

    setAssignChemData({
      chemical_name: cc.chemicals?.chemical_name || '',
      cas_number: cc.chemicals?.cas_number || '',
      ec_number: cc.chemicals?.ec_number || '',
      tonnage_band: cc.chemicals?.tonnage_band || '',
      available_quantity: '',
      registration_number: cc.registration_number || '',
      certificate_year: String(targetYear),
      issued_date: period.issuedDate,
      validated_date: period.validatedDate,
      validity_date: period.validatedDate,
      allocated_quantity: bandMax != null ? String(bandMax) : '',
      target_chemical_id: chemId,
    });
  };

  const openAssignChemModal = () => {
    setAssignChemModalMode('assign');
    setModalError('assignChem', null);
    setAssignChemData(emptyAssignChemData());
    setAssignChemModalOpen(true);
  };

  const openIssueRcForPending = (row: RcChemicalSummaryRow) => {
    const cc = row.clientChem;
    const year = new Date().getFullYear();
    const period = getDefaultReachPeriodForYear(year);
    const band = cc.chemicals?.tonnage_band?.trim() || row.tonnageBand || '';
    const bandMax = getTonnageBandMaxQuota(band);

    setAssignChemModalMode('issue');
    setModalError('assignChem', null);
    setAssignChemData({
      chemical_name: row.chemicalName,
      cas_number: row.casNumber !== 'N/A' ? row.casNumber : cc.chemicals?.cas_number || '',
      ec_number: row.ecNumber !== 'N/A' ? row.ecNumber : cc.chemicals?.ec_number || '',
      tonnage_band: band,
      registration_number: cc.registration_number?.trim() || '',
      certificate_year: String(year),
      issued_date: period.issuedDate,
      validated_date: period.validatedDate,
      validity_date: period.validatedDate,
      available_quantity: '',
      allocated_quantity: bandMax != null ? String(bandMax) : '',
      target_chemical_id: cc.chemical_id,
    });
    setAssignChemModalOpen(true);
  };

  const validateSubstanceRcForm = () => {
    if (!assignChemData.chemical_name.trim()) {
      setModalError('assignChem', 'Substance name is required.');
      return false;
    }
    if (!assignChemData.cas_number.trim()) {
      setModalError('assignChem', 'CAS number is required.');
      return false;
    }
    if (!assignChemData.ec_number.trim()) {
      setModalError('assignChem', 'EC number is required.');
      return false;
    }
    if (!assignChemData.registration_number.trim()) {
      setModalError('assignChem', 'Registration number is required.');
      return false;
    }
    if (!assignChemData.issued_date) {
      setModalError('assignChem', 'Issued date is required.');
      return false;
    }
    if (!assignChemData.validated_date) {
      setModalError('assignChem', 'Validated date is required.');
      return false;
    }
    if (new Date(assignChemData.validated_date) < new Date(assignChemData.issued_date)) {
      setModalError('assignChem', 'Validated date cannot be before issued date.');
      return false;
    }
    const issuedYear = new Date(assignChemData.issued_date).getFullYear();
    const validatedYear = new Date(assignChemData.validated_date).getFullYear();
    if (validatedYear > issuedYear) {
      setModalError('assignChem', 'This certificate is only valid for one year or until the last date of the issue year.');
      return false;
    }
    const certYear = Number(assignChemData.certificate_year);
    if (!Number.isNaN(certYear)) {
      const issuedDateObj = new Date(assignChemData.issued_date);
      const validatedDateObj = new Date(assignChemData.validated_date);
      if (issuedDateObj.getFullYear() !== certYear) {
        setModalError('assignChem', `Issued date must be in the selected certificate year (${certYear}).`);
        return false;
      }
      if (validatedDateObj.getFullYear() !== certYear) {
        setModalError('assignChem', `Validated date must be in the selected certificate year (${certYear}).`);
        return false;
      }
    }
    if (rcCertFormMode === 'edit' && editingCertId) {
      const cc = findClientChemRow(renewChemicalId);
      const siblingCerts = cc
        ? getReachCertsForClientChemical(
            certificates || [],
            renewChemicalId,
            cc.chemicals?.cas_number,
            cc.registration_number,
            cc.certificate_number
          )
        : rcCertificates.filter((c) => c.chemical_id === renewChemicalId);

      const yearConflict = siblingCerts.some(
        (c) => c.id !== editingCertId && getReachCertificateYear(c.issued_at) === Number(assignChemData.certificate_year)
      );

      if (yearConflict) {
        setModalError('assignChem', 'A certificate has already been issued for this substance in the selected year.');
        return false;
      }
    } else if (rcCertFormMode === 'edit' && assignChemData.target_chemical_id !== 'new_substance') {
      const yearConflict = findReachCertificateYearConflict(
        (certificates || []) as import('@/lib/reach-certificate').ReachCertificateRecord[],
        renewChemicalId || assignChemData.target_chemical_id,
        Number(assignChemData.certificate_year),
        assignChemData.chemical_name.trim() || 'this substance',
        assignChemData.cas_number,
        assignChemData.registration_number
      );
      if (yearConflict) {
        setModalError('assignChem', yearConflict);
        return false;
      }
    } else if (assignChemData.target_chemical_id !== 'new_substance') {
      const yearConflict = findReachCertificateYearConflict(
        (certificates || []) as import('@/lib/reach-certificate').ReachCertificateRecord[],
        assignChemData.target_chemical_id,
        Number(assignChemData.certificate_year),
        assignChemData.chemical_name.trim() || 'this substance',
        assignChemData.cas_number,
        assignChemData.registration_number
      );
      if (yearConflict) {
        setModalError('assignChem', yearConflict);
        return false;
      }
    }
    return true;
  };

  const handleAssignChemical = () => {
    if (!validateSubstanceRcForm()) return;

    const year = Number(assignChemData.certificate_year);
    const existingCc = clientChemicals.find(
      (cc) => cc.chemicals?.cas_number?.trim().toLowerCase() === assignChemData.cas_number.trim().toLowerCase()
    );
    if (existingCc && !Number.isNaN(year)) {
      const yearConflict = findReachCertificateYearConflict(
        (certificates || []) as import('@/lib/reach-certificate').ReachCertificateRecord[],
        existingCc.chemical_id,
        year,
        assignChemData.chemical_name.trim() || 'this substance',
        assignChemData.cas_number,
        assignChemData.registration_number
      );
      if (yearConflict) {
        setModalError('assignChem', yearConflict);
        return;
      }
    }

    const bandMax = getTonnageBandMaxQuota(assignChemData.tonnage_band);
    const payload = {
      ...assignChemData,
      target_chemical_id:
        assignChemData.target_chemical_id === 'new_substance'
          ? undefined
          : assignChemData.target_chemical_id?.trim() || undefined,
      available_quantity:
        assignChemData.allocated_quantity?.trim() ||
        (bandMax != null ? String(bandMax) : assignChemData.available_quantity),
    };

    setModalError('assignChem', null);
    startTransition(async () => {
      const res = await addNewChemicalToClientAction(client.id, payload);
      if (res.success) {
        toast.success(res.message || 'RC Certificate issued successfully.');
        closeAssignChemModal();
        router.refresh();
      } else {
        setModalError('assignChem', toErrorMessage(res.error, 'Failed to assign substance.'));
      }
    });
  };

  const openRenewRcModal = (cc: ClientChemRow, certId?: string | null) => {
    setRcCertFormMode('renew');
    setRenewChemicalId(cc.chemical_id);
    setEditingCertId(null);
    setModalError('assignChem', null);
    setAssignChemData(buildSubstanceFormFromClientChem(cc, certId, true));
    setRcCertModalOpen(true);
  };

  const openEditRcCertModal = (cc: ClientChemRow, certId?: string | null) => {
    setRcCertFormMode('edit');
    setRenewChemicalId(cc.chemical_id);
    setEditingCertId(certId ?? null);
    setModalError('assignChem', null);
    setAssignChemData(buildSubstanceFormFromClientChem(cc, certId));
    setRcCertModalOpen(true);
  };

  const openRenewFromSummary = (row: RcChemicalSummaryRow) => {
    if (!row.latestCert) {
      openAssignChemModal();
      return;
    }
    if (!isLatestReachCertificate(row.certs, row.latestCert)) {
      toast.error('Renew is only allowed from the latest certificate year.');
      return;
    }
    if (!row.canRenew) {
      toast.error('An active RC certificate already exists. Renew when the latest certificate has expired.');
      return;
    }
    openRenewRcModal(row.clientChem as ClientChemRow, row.latestCert.id);
  };

  const handleRenewRc = () => {
    if (!validateSubstanceRcForm()) return;
    const quota = assignChemData.allocated_quantity
      ? Number(assignChemData.allocated_quantity)
      : getTonnageBandMaxQuota(assignChemData.tonnage_band);
    if (!quota || quota <= 0 || Number.isNaN(quota)) {
      setModalError('assignChem', 'Please select a valid tonnage band to determine the quota.');
      return;
    }
    const year = Number(assignChemData.certificate_year);
    const yearConflict = !Number.isNaN(year)
      ? findReachCertificateYearConflict(
          (certificates || []) as import('@/lib/reach-certificate').ReachCertificateRecord[],
          renewChemicalId,
          year,
          assignChemData.chemical_name.trim() || 'this substance',
          assignChemData.cas_number,
          assignChemData.registration_number
        )
      : null;
    if (yearConflict) {
      setModalError('assignChem', yearConflict);
      return;
    }
    const periodConflict = findReachCertificatePeriodConflict(
      (certificates || []) as import('@/lib/reach-certificate').ReachCertificateRecord[],
      renewChemicalId,
      assignChemData.chemical_name.trim() || 'this substance',
      assignChemData.issued_date,
      assignChemData.validated_date,
      undefined,
      assignChemData.cas_number,
      assignChemData.registration_number
    );
    if (periodConflict) {
      setModalError('assignChem', periodConflict);
      return;
    }
    setModalError('assignChem', null);
    startTransition(async () => {
      const editRes = await editClientChemicalAction(client.id, renewChemicalId, {
        chemical_name: assignChemData.chemical_name,
        cas_number: assignChemData.cas_number,
        ec_number: assignChemData.ec_number,
        tonnage_band: assignChemData.tonnage_band,
        validity_date: assignChemData.validated_date,
        registration_number: assignChemData.registration_number.trim(),
        issued_date: assignChemData.issued_date,
      });
      if (!editRes.success) {
        setModalError('assignChem', toErrorMessage(editRes.error, 'Failed to update substance details.'));
        return;
      }

      const res = await renewReachCertificateAction(client.id, renewChemicalId, {
        issuedDate: assignChemData.issued_date,
        validatedDate: assignChemData.validated_date,
        available_quantity: quota,
        registrationNumber: assignChemData.registration_number.trim(),
        tonnageBand: assignChemData.tonnage_band,
      });
      if (res.success) {
        closeRcCertModal();
        router.refresh();
        setTimeout(() => {
          toast.success(res.message || 'New RC certificate issued. Previous certificates remain on record.');
        }, 300);
      } else {
        setModalError('assignChem', toErrorMessage(res.error, 'Failed to renew RC certificate.'));
      }
    });
  };

  const handleEditSubstanceRc = () => {
    if (!validateSubstanceRcForm()) return;
    setModalError('assignChem', null);
    startTransition(async () => {
      const editRes = await editClientChemicalAction(client.id, renewChemicalId, {
        chemical_name: assignChemData.chemical_name,
        cas_number: assignChemData.cas_number,
        ec_number: assignChemData.ec_number,
        tonnage_band: assignChemData.tonnage_band,
        validity_date: assignChemData.validated_date,
        registration_number: assignChemData.registration_number.trim(),
        issued_date: assignChemData.issued_date,
      });
      if (!editRes.success) {
        setModalError('assignChem', toErrorMessage(editRes.error, 'Failed to update substance details.'));
        return;
      }

      const ccRow = findClientChemRow(renewChemicalId);
      const siblingCerts = ccRow
        ? getReachCertsForClientChemical(
            certificates || [],
            renewChemicalId,
            ccRow.chemicals?.cas_number,
            ccRow.registration_number,
            ccRow.certificate_number
          )
        : rcCertificates.filter((c) => c.chemical_id === renewChemicalId);
      const certToUpdate = editingCertId
        ? siblingCerts.find((c) => c.id === editingCertId)
        : siblingCerts[0];

      let certMessage: string | undefined;
      if (certToUpdate?.id) {
        const bandMax = getTonnageBandMaxQuota(assignChemData.tonnage_band);
        const certRes = await updateReachCertificateAction(certToUpdate.id, {
          registrationNumber: assignChemData.registration_number.trim(),
          issuedDate: assignChemData.issued_date,
          validatedDate: assignChemData.validated_date,
          allocatedQuantity: assignChemData.allocated_quantity
            ? Number(assignChemData.allocated_quantity)
            : (bandMax ?? null),
          tonnageBand: assignChemData.tonnage_band,
        });
        if (!certRes.success) {
          setModalError('assignChem', toErrorMessage(certRes.error, 'Failed to update RC certificate.'));
          return;
        }
        certMessage = certRes.message;
      } else if (
        assignChemData.registration_number.trim() &&
        assignChemData.issued_date &&
        assignChemData.validated_date
      ) {
        const bandMax = getTonnageBandMaxQuota(assignChemData.tonnage_band);
        const issueRes = await issueReachCertificateWithDetailsAction(client.id, renewChemicalId, {
          registrationNumber: assignChemData.registration_number.trim(),
          issuedDate: assignChemData.issued_date,
          validatedDate: assignChemData.validated_date,
          tonnageBand: assignChemData.tonnage_band || null,
          allocatedQuantity: assignChemData.allocated_quantity
            ? Number(assignChemData.allocated_quantity)
            : (bandMax ?? 0),
        });
        if (!issueRes.success) {
          setModalError('assignChem', toErrorMessage(issueRes.error, 'Failed to issue RC certificate.'));
          return;
        }
        certMessage = issueRes.message;
      }

      toast.success(certMessage || editRes.message || 'Substance and RC details updated.');
      closeRcCertModal();
      router.refresh();
    });
  };

  const handleRemoveChemical = (chemId: string) => {
    if (confirm('Move this substance to trash? You can restore it from the Trash box below.')) {
      startTransition(async () => {
        const res = await removeChemicalFromClientAction(client.id, chemId);
        if (res.success) { toast.success('Substance moved to trash.'); router.refresh(); }
        else setModalError('substances', toErrorMessage(res.error, 'Failed to remove substance.'));
      });
    }
  };

  const handleRestoreClientChemical = (chemId: string) => {
    startTransition(async () => {
      const res = await restoreClientChemicalAction(client.id, chemId);
      if (res.success) {
        toast.success(res.message || 'Substance restored.');
        router.refresh();
      } else {
        setModalError('substances', toErrorMessage(res.error, 'Failed to restore substance.'));
      }
    });
  };

  const handlePermanentDeleteClientChemical = (chemId: string, name: string) => {
    if (
      !confirm(
        `Permanently delete "${name}" from this client? This removes the assignment forever and cannot be undone.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await permanentDeleteClientChemicalAction(client.id, chemId);
      if (res.success) {
        toast.success(res.message || 'Substance permanently deleted.');
        router.refresh();
      } else {
        setModalError('substances', toErrorMessage(res.error, 'Failed to permanently delete.'));
      }
    });
  };
  const handleAddContact = () => {
    if (!contactData.first_name.trim() || !contactData.last_name.trim() || !contactData.email.trim()) {
      setModalError('contact', 'First name, last name, and email are required.');
      return;
    }
    setModalError('contact', null);
    startTransition(async () => {
      const res = await addContactAction(client.id, contactData);
      if (res.success) {
        toast.success('Contact added.');
        setContactModalOpen(false);
        router.refresh();
      } else {
        setModalError('contact', toErrorMessage(res.error, 'Failed to add contact.'));
      }
    });
  };
  const handleDeleteContact = (id: string) => {
    if (confirm('Delete contact?')) {
      startTransition(async () => {
        const res = await deleteContactAction(id, client.id);
        if (res.success) { toast.success('Contact deleted.'); router.refresh(); }
        else toast.error(res.error || 'Error');
      });
    }
  };
  const handleAddNote = () => {
    if (!noteContent.trim()) {
      setModalError('note', 'Note cannot be empty.');
      return;
    }
    setModalError('note', null);
    startTransition(async () => {
      const res = await addInternalNoteAction(client.id, noteContent);
      if (res.success) {
        toast.success('Note added.');
        setNoteModalOpen(false);
        setNoteContent('');
        router.refresh();
      } else {
        setModalError('note', toErrorMessage(res.error, 'Failed to save note.'));
      }
    });
  };
  const handleDeleteNote = (id: string) => {
    if (confirm('Delete note?')) {
      startTransition(async () => {
        const res = await deleteInternalNoteAction(id, client.id);
        if (res.success) { toast.success('Note deleted.'); router.refresh(); }
        else toast.error(res.error || 'Error');
      });
    }
  };

  const handleBulkSendRcCertificates = () => {
    if (selectedRcCertIds.length === 0) {
      toast.error('Select at least one RC certificate.');
      return;
    }

    startTransition(async () => {
      const res = await sendBulkReachCertificatesEmailAction(client.id, selectedRcCertIds);
      if (res.success) {
        toast.success(res.message || 'RC certificates sent successfully.');
        setSelectedRcCertIds([]);
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to send RC certificates.');
      }
    });
  };

  const handleDeleteRcCertificate = () => {
    if (!rcDeleteTarget) return;
    startTransition(async () => {
      const res =
        rcDeleteTarget.kind === 'issued'
          ? await deleteReachCertificateAction(rcDeleteTarget.id, client.id)
          : await removeChemicalFromClientAction(client.id, rcDeleteTarget.chemicalId);
      if (res.success) {
        toast.success(res.message || 'Removed successfully.');
        setRcDeleteTarget(null);
        setRcHistoryTarget(null);
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to remove.');
      }
    });
  };

  const handleDeleteClient = () => {
    startTransition(async () => {
      const res = await deleteClientAction(client.id);
      if (res.success) {
        toast.success(res.message || 'Client deleted successfully.');
        setDeleteClientOpen(false);
        router.push('/admin/clients');
        router.refresh();
      } else {
        setModalError('security', res.error || 'Failed to delete client.');
        toast.error(res.error || 'Failed to delete client.');
      }
    });
  };

  const resolveChemical = (row: { chemicals?: { chemical_name?: string } | null }) =>
    row.chemicals?.chemical_name || 'N/A';

  const resolveCertificate = (row: { certificates?: { id?: string; certificate_number?: string; file_url?: string; issued_at?: string; status?: string } | { id?: string; certificate_number?: string; file_url?: string; issued_at?: string; status?: string }[] | null }) => {
    const cert = row.certificates;
    if (!cert) return null;
    if (Array.isArray(cert)) return cert[0] ?? null;
    return cert;
  };

  const resolveTccCertificateNumber = (row: { certificates?: { certificate_number?: string } | { certificate_number?: string }[] | null }) =>
    resolveCertificate(row)?.certificate_number || null;

  const buildViewApplication = (app: Record<string, unknown>): TccViewApplication => {
    const chem = app.chemicals as {
      chemical_name?: string;
      cas_number?: string;
      ec_number?: string | null;
      tonnage_band?: string | null;
      validity_date?: string | null;
      available_quantity?: number;
    } | null;
    let cc: { available_quantity: number } | null = null;
    const rawCc = app.client_chemicals as { available_quantity?: number } | null;
    if (rawCc?.available_quantity != null) {
      cc = { available_quantity: Number(rawCc.available_quantity) };
    } else if (app.chemical_id) {
      const match = clientChemicals.find((c) => c.chemical_id === app.chemical_id);
      if (match) cc = { available_quantity: Number(match.available_quantity ?? 0) };
    }
    const chemicalId = app.chemical_id as string | undefined;
    const exportDate = (app.export_date as string | null | undefined) ?? null;
    let remainingQuota = 0;
    let rcPeriodCertificate: string | null = null;
    let rcTonnageBand: string | null = null;
    let rcRegistrationNumber: string | null = null;
    let rcCertificateYear: number | null = null;

    if (chemicalId && exportDate) {
      const quota = computeTccApplicationRcQuota(
        {
          id: app.id as string,
          chemical_id: chemicalId,
          export_date: exportDate,
          status: app.status as string,
          chemicals: chem,
        },
        rcCertificates as import('@/lib/reach-certificate').ReachCertificateRecord[],
        tccHistory
      );
      remainingQuota = quota.remainingQuota;
      rcPeriodCertificate = quota.reachCert?.certificate_number ?? null;
      rcTonnageBand = quota.reachCert?.tonnage_band ?? null;
      rcRegistrationNumber = quota.reachCert?.registration_number ?? null;
      rcCertificateYear = getReachCertificateYear(quota.reachCert?.issued_at ?? null);
    } else if (chemicalId) {
      const exportedRaw = sumApprovedExports(tccHistory, chemicalId, chartYear);
      const tonnageBand = chem?.tonnage_band ?? null;
      remainingQuota = getRemainingQuota(Number(cc?.available_quantity ?? 0), exportedRaw, tonnageBand);
    }
    cc = { available_quantity: remainingQuota };
    return {
      id: app.id as string,
      tracking_id: app.tracking_id as string | undefined,
      quantity_mt: Number(app.quantity_mt ?? 0),
      registration_number:
        rcRegistrationNumber?.trim() || (app.registration_number as string) || '',
      export_date: (app.export_date as string | null | undefined) ?? null,
      remarks: app.remarks as string | null | undefined,
      status: app.status as string,
      rejection_reason: app.rejection_reason as string | null | undefined,
      eu_importer_company_name: app.eu_importer_company_name as string | null | undefined,
      eu_importer_address: app.eu_importer_address as string | null | undefined,
      purchase_order_number: app.purchase_order_number as string | null | undefined,
      invoice_number: app.invoice_number as string | null | undefined,
      bo_attachment_url: app.bo_attachment_url as string | null | undefined,
      bo_attachment_name: app.bo_attachment_name as string | null | undefined,
      created_at: app.created_at as string,
      updated_at: (app.updated_at as string | undefined) ?? (app.created_at as string),
      client_chemicals: cc,
      clients: { company_name: client.company_name, email: client.email },
      chemicals: {
        chemical_name: chem?.chemical_name || 'N/A',
        cas_number: chem?.cas_number || 'N/A',
        ec_number: chem?.ec_number ?? null,
        tonnage_band: chem?.tonnage_band ?? null,
        validity_date: chem?.validity_date ?? null,
        available_quantity: remainingQuota,
      },
      rc_remaining_quota: remainingQuota,
      rc_period_certificate: rcPeriodCertificate,
      rc_tonnage_band: rcTonnageBand,
      rc_registration_number: rcRegistrationNumber,
      rc_certificate_year: rcCertificateYear,
      certificate_issue_date: (app.certificate_issue_date as string | null | undefined) ?? null,
      certificates: app.certificates as TccViewApplication['certificates'],
    };
  };

  const handleOpenTccView = (app: (typeof tccHistory)[number]) => {
    setViewTccApp(buildViewApplication(app));
    setIsTccViewOpen(true);
  };

  const handleOpenTccAction = (
    app: TccViewApplication,
    type: 'approved' | 'rejected' | 'changes_required'
  ) => {
    setSelectedTccApp(app);
    setTccActionType(type);
    setTccRejectionReason('');
    setTccActionError(null);
    setIsTccActionOpen(true);
  };

  const handleTccViewThenAction = (type: 'approved' | 'rejected' | 'changes_required') => {
    if (!viewTccApp) return;
    setIsTccViewOpen(false);
    handleOpenTccAction(viewTccApp, type);
  };

  const handleProcessTccAction = () => {
    if (!selectedTccApp) return;
    setTccActionError(null);

    if (tccActionType !== 'approved' && !tccRejectionReason.trim()) {
      const msg = 'A reason explanation is required for rejection/modification requests.';
      setTccActionError(msg);
      toast.error(msg);
      return;
    }

    startTransition(async () => {
      const res = await processTccAction(selectedTccApp.id, tccActionType, tccRejectionReason);
      if (res.success) {
        setIsTccActionOpen(false);
        if (tccActionType === 'approved' && res.certificateId) {
          toast.success('Certificate generated! Redirecting to preview...');
          router.push(`/admin/certificate-preview/${res.certificateId}`);
        } else {
          toast.success(res.message || 'Application processed.');
          router.refresh();
        }
      } else {
        setTccActionError(res.error || 'Failed to process application action.');
        toast.error(res.error || 'Failed to process application action.');
      }
    });
  };

  const getTccStatusBadge = (status: string) => {
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
            <AlertCircle className="h-3 w-3" /> Revision Needed
          </Badge>
        );
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const tccStatusDisplay = (status: string) => {
    switch (status) {
      case 'approved':
        return { label: 'Approved', className: 'text-emerald-600', icon: CheckCircle };
      case 'rejected':
        return { label: 'Rejected', className: 'text-rose-600', icon: AlertCircle };
      case 'changes_required':
      case 'modification_requested':
        return { label: 'Changes Required', className: 'text-amber-600', icon: AlertCircle };
      default:
        return { label: 'Pending Review', className: 'text-amber-600', icon: History };
    }
  };

  const handleExportCSV = () => {
    const allCertRows = rcChemicalSummaryRows.flatMap((summary) =>
      summary.certs.map((cert) => ({ summary, cert }))
    );
    if (allCertRows.length === 0) {
      setModalError('substances', 'No RC certificate data to export.');
      return;
    }
    setModalError('substances', null);

    const headers = [
      'Year',
      'Substance Name',
      'CAS Number',
      'EC Number',
      'Tonnage Band',
      'Certificate No.',
      'Registration No.',
      'Issue Date',
      'Validity',
      'Allocated (MT)',
      'Used (MT)',
      'Remaining (MT)',
      'Status',
    ];

    const rows = allCertRows.map(({ summary, cert }) => {
      const history = buildRcHistoryRows(summary, tccHistory).find((row) => row.cert.id === cert.id);
      const status = getReachCertificateStatus(cert);

      return [
        getReachCertificateYear(cert.issued_at) ?? '',
        summary.chemicalName,
        summary.casNumber,
        summary.ecNumber,
        resolveDisplayedTonnageBand(cert.tonnage_band, summary.tonnageBand || null),
        cert.certificate_number,
        cert.registration_number || '',
        cert.issued_at ? new Date(cert.issued_at).toLocaleDateString('en-GB') : '',
        cert.expires_at ? new Date(cert.expires_at).toLocaleDateString('en-GB') : '',
        history?.allocated.toFixed(0) ?? '',
        history?.used.toFixed(0) ?? '',
        history?.balance.toFixed(0) ?? '',
        status === 'valid' ? 'Active' : status === 'expired' ? 'Expired' : cert.status,
      ]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${client.company_name.replace(/\s+/g, '_')}_Substances.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-slide-in pb-12 text-slate-800">

      {/* 1. Header Section */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-teal-900 tracking-tight">{pageTitle}</h1>
          
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {currentUserRole !== 'CLIENT' && (
            <Link href={`/admin/clients/${client.id}/edit`}>
              <Button variant="outline" size="sm" className="bg-white border-slate-200 shadow-xs">
                Edit Profile
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* 2. Main Dashboard Layout */}
      {showOverview && (
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* Left Column: Stat Cards */}
        <div className="space-y-4 lg:col-span-1">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between h-[120px]">
            <div className="flex justify-between items-start">
              <span className="text-sm font-semibold text-slate-500">Active Permissions</span>
              <CheckCircle className="h-5 w-5 text-teal-700" />
            </div>
            <div>
              <div className="text-2xl font-black text-slate-800">{activePermissions} <span className="text-sm text-slate-500 font-semibold">Substances</span></div>
              <div className="text-xs font-semibold text-slate-500 mt-1">
                {pendingRenewals} Renewals pending
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Chart */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col min-h-[360px]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-600">Monthly TCC Activity</h3>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                Substance-wise approved export lines (MT per month)
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {activityYears.map((year) => {
                const selected = selectedChartYears.includes(year);
                return (
                  <button
                    key={year}
                    type="button"
                    onClick={() =>
                      setSelectedChartYears((prev) => {
                        if (selected) {
                          const next = prev.filter((y) => y !== year);
                          return next.length > 0 ? next : [year];
                        }
                        return [...prev, year].sort((a, b) => a - b);
                      })
                    }
                    className={`px-2 py-1 text-xs font-semibold rounded border transition-colors ${
                      selected
                        ? 'bg-teal-50 border-teal-200 text-teal-800'
                        : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    {year}
                  </button>
                );
              })}
            </div>
          </div>

          {chartLegend.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4 pb-3 border-b border-slate-100">
              {chartLegend.map((item) => (
                <span
                  key={item.name}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold border"
                  style={{
                    borderColor: item.color,
                    color: item.color,
                    backgroundColor: `${item.color}14`,
                  }}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  {item.name}
                  <span className="text-slate-400 font-semibold">
                    · {item.total.toFixed(1)} MT
                  </span>
                </span>
              ))}
            </div>
          )}

          <div className="flex-1 w-full h-full min-h-[280px]">
            {isMounted && chartSeries.length > 0 ? (
              <ApexChart options={chartOptions} series={chartSeries} type="line" height="100%" width="100%" />
            ) : isMounted ? (
              <div className="flex h-full min-h-[280px] items-center justify-center text-sm text-slate-400 font-medium">
                Assign substances to this client to see activity chart.
              </div>
            ) : null}
          </div>
        </div>
      </div>
      )}

      {/* 3. RC Certificates — Chemical Summary */}
      {showChemicalsSection && (
      <>
      {!hasEuReach && canManageRc && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">EU REACH not enabled</p>
          <p className="mt-1 text-xs text-amber-800">
            This client is not registered for EU REACH. EU REACH (RC) and TCC certificates can only be
            issued when EU REACH is enabled on the client profile.
          </p>
        </div>
      )}
      <RcCertificatesTable
        certificates={rcCertificates as any}
        clientChemicals={clientChemicals}
        currentUserRole={currentUserRole}
        hideCompanyColumn={true}
        hideMailColumn={true}
        hideFilters={true}
        hideCheckboxColumn={currentUserRole === 'CLIENT'}
        selectedIds={selectedRcCertIds}
        onSelectedIdsChange={setSelectedRcCertIds}
        tccHistory={tccHistory}
        title="RC Compliance Certificates (Year-wise)"
        description="Manage issue/expiry dates & remaining quota per year | Expired certificates retain quantity for TCC applications using old date."
        extraActions={
          <>
            {canIssueRc && selectedRcCertIds.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 border-teal-200 text-teal-800 hover:bg-teal-50"
                onClick={handleBulkSendRcCertificates}
                disabled={isPending}
                isLoading={isPending}
              >
                <Mail className="h-3.5 w-3.5 mr-1.5" />
                Send Mail ({selectedRcCertIds.length})
              </Button>
            )}
            {canIssueRc && (
              <Button size="sm" className="h-8 bg-teal-700 hover:bg-teal-800 ml-2 font-bold" onClick={openAssignChemModal}>
                + Assign Sub. (New RC)
              </Button>
            )}
          </>
        }
        exportFilename={`${client.company_name.replace(/\s+/g, '_')}_rc_certificates`}
        onEdit={canIssueRc ? openEditRcCertModal : undefined}
        onRenew={canIssueRc ? openRenewRcModal : undefined}
        onDelete={
          canIssueRc
            ? (cert) => {
                const isPending = !cert.id;
                if (isPending) {
                  if (!cert.chemical_id) {
                    toast.error('Cannot remove this substance assignment.');
                    return;
                  }
                  setRcDeleteTarget({
                    kind: 'pending',
                    chemicalId: cert.chemical_id,
                    chemical_name: cert.chemical_name || 'Unknown',
                  });
                  return;
                }

                setRcDeleteTarget({
                  kind: 'issued',
                  id: cert.id,
                  certificate_number: cert.certificate_number,
                  chemical_name: (cert.chemicals || cert.chemical)?.chemical_name || 'Unknown',
                });
              }
            : undefined
        }
        clientId={client.id}
      />

      {/* Trash Box Section */}
      {currentUserRole !== 'CLIENT' && trashedChemicals.length > 0 && (
        <div className="bg-slate-50 rounded-xl border border-dashed border-slate-300 shadow-xs overflow-hidden mt-8 opacity-80 hover:opacity-100 transition-opacity">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-slate-500" />
              <h2 className="font-bold text-slate-600 text-sm">Deleted Inventory (Trash)</h2>
            </div>
            <span className="text-xs text-slate-400">Restore to bring back · Delete permanently to remove forever</span>
          </div>
          <ResponsiveTableScroll>
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-100 text-slate-400 font-bold text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">Substance Name</th>
                  <th className="px-6 py-3">CAS Number</th>
                  <th className="px-6 py-3">Deleted Date</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trashedChemicals.map((cc) => (
                  <tr key={cc.id}>
                    <td className="px-6 py-3 text-slate-500 font-medium">{cc.chemicals?.chemical_name || 'Unknown'}</td>
                    <td className="px-6 py-3 text-slate-400 font-mono text-[11px]">{cc.chemicals?.cas_number || 'N/A'}</td>
                    <td className="px-6 py-3 text-slate-400" suppressHydrationWarning>{new Date(cc.updated_at).toLocaleDateString('en-GB')}</td>
                    <td className="px-6 py-3">
                      <span className="px-2 py-0.5 bg-slate-200 text-slate-500 rounded text-[10px] font-bold">TRASHED</span>
                    </td>
                    <td className="px-6 py-3 text-right whitespace-nowrap">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs mr-2"
                        disabled={isPending}
                        onClick={() => handleRestoreClientChemical(cc.chemical_id)}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" />
                        Restore
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 text-xs bg-rose-600 hover:bg-rose-700 text-white"
                        disabled={isPending}
                        onClick={() =>
                          handlePermanentDeleteClientChemical(
                            cc.chemical_id,
                            cc.chemicals?.chemical_name || 'this substance'
                          )
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Delete permanently
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTableScroll>
        </div>
      )}

      </>
      )}

      <Dialog
        isOpen={!!rcHistoryTarget}
        onClose={() => setRcHistoryTarget(null)}
        title={rcHistoryTarget ? `${rcHistoryTarget.chemicalName} — RC History` : 'RC History'}
      >
        <ResponsiveTableScroll>
          <table className="w-full text-sm text-left">
            <thead className="text-slate-500 font-bold text-[11px] uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Year</th>
                <th className="px-4 py-3 text-center">Quantity</th>
                <th className="px-4 py-3 text-center">Used</th>
                <th className="px-4 py-3 text-center">Balance</th>
                <th className="px-4 py-3">Issue Date</th>
                <th className="px-4 py-3">Validity Date</th>
                <th className="px-4 py-3 text-center">Status</th>
                {currentUserRole !== 'CLIENT' && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rcHistoryRows.length === 0 ? (
                <tr>
                  <td colSpan={currentUserRole !== 'CLIENT' ? 8 : 7} className="px-4 py-8 text-center text-slate-400">
                    No certificate history for this substance.
                  </td>
                </tr>
              ) : (
                rcHistoryRows.map((historyRow, index) => {
                  const isLatest = index === 0;
                  const cc = rcHistoryTarget?.clientChem as ClientChemRow | undefined;
                  return (
                    <tr key={historyRow.cert.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-bold text-teal-800">{historyRow.year ?? '—'}</td>
                      <td className="px-4 py-3 text-center font-medium">{historyRow.allocated.toFixed(0)} MT</td>
                      <td className="px-4 py-3 text-center text-slate-600">{historyRow.used.toFixed(0)} MT</td>
                      <td className="px-4 py-3 text-center font-semibold text-teal-800">{historyRow.balance.toFixed(0)} MT</td>
                      <td className="px-4 py-3 text-slate-600" suppressHydrationWarning>
                        {historyRow.cert.issued_at
                          ? new Date(historyRow.cert.issued_at).toLocaleDateString('en-GB')
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600" suppressHydrationWarning>
                        {historyRow.cert.expires_at
                          ? new Date(historyRow.cert.expires_at).toLocaleDateString('en-GB')
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge
                          variant={historyRow.status === 'Active' ? 'success' : 'warning'}
                          className="text-[10px] uppercase font-bold"
                        >
                          {historyRow.status}
                        </Badge>
                      </td>
                      {currentUserRole !== 'CLIENT' && cc && (
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex justify-end gap-1">
                            <Link href={`/admin/clients/${client.id}/rc-preview/${cc.chemical_id}?certId=${historyRow.cert.id}`}>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-teal-700" title="View">
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                            </Link>
                            <CertificatePdfDownloadLink
                              pdfUrl={buildReachCertificatePdfDownloadUrl(historyRow.cert.id)}
                              docxUrl={buildReachCertificateDocxPreviewUrl(historyRow.cert.id)}
                              fileName={`${historyRow.cert.certificate_number}.pdf`}
                              certificateType="rc"
                              title="Download PDF"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </CertificatePdfDownloadLink>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-slate-600"
                              title="Edit"
                              onClick={() => {
                                setRcHistoryTarget(null);
                                openEditRcCertModal(cc, historyRow.cert.id);
                              }}
                            >
                              <PenLine className="h-3.5 w-3.5" />
                            </Button>
                            {isLatest && rcHistoryTarget?.canRenew && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-teal-700"
                                title="Renew"
                                onClick={() => {
                                  setRcHistoryTarget(null);
                                  openRenewRcModal(cc, historyRow.cert.id);
                                }}
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-rose-500"
                              title="Delete certificate"
                              onClick={() =>
                                setRcDeleteTarget({
                                  kind: 'issued',
                                  id: historyRow.cert.id,
                                  certificate_number: historyRow.cert.certificate_number,
                                  chemical_name: rcHistoryTarget?.chemicalName || '',
                                })
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </ResponsiveTableScroll>
      </Dialog>

      <Dialog
        isOpen={!!rcDeleteTarget}
        onClose={() => setRcDeleteTarget(null)}
        title={rcDeleteTarget?.kind === 'pending' ? 'Remove Assigned Substance' : 'Delete RC Certificate'}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {rcDeleteTarget?.kind === 'pending' ? (
              <>
                Remove assigned substance <strong>{rcDeleteTarget.chemical_name}</strong> from this client?
                The pending RC certificate row will be removed.
              </>
            ) : (
              <>
                Permanently delete RC Certificate{' '}
                <strong className="font-mono text-slate-800">{rcDeleteTarget?.certificate_number}</strong>{' '}
                for <strong>{rcDeleteTarget?.chemical_name}</strong>? It will be removed from the database and
                storage — this cannot be undone.
              </>
            )}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setRcDeleteTarget(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteRcCertificate}
              isLoading={isPending}
              disabled={isPending}
            >
              {rcDeleteTarget?.kind === 'pending' ? 'Remove Substance' : 'Delete Certificate'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 4. TCC Applications & Issued Certificates */}
      {showCertificatesSection && (
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden mt-8">
        <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-white">
          <h2 className="font-bold text-slate-700 text-sm">
            {currentUserRole === 'CLIENT' ? 'My TCC Applications & Certificates' : 'Issued Export Certificates'}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <TableDataExport
              filename={`${client.company_name}-tcc-applications`}
              columns={TCC_CLIENT_EXPORT_COLUMNS}
              filteredRows={tccHistory}
              selectedIds={selectedTccAppIds}
              getRowId={(app) => app.id}
            />
            {currentUserRole === 'CLIENT' && hasAnyRegulatoryRegistration ? (
              <Button
                type="button"
                size="sm"
                className="h-8 bg-teal-700 hover:bg-teal-800"
                onClick={() => router.push('/client/apply')}
              >
                + Apply for TCC
              </Button>
            ) : currentUserRole === 'CLIENT' ? null : (
              <Link href="/admin/approvals">
                <Button size="sm" variant="outline" className="h-8 border-slate-300">
                  Review Applications
                </Button>
              </Link>
            )}
          </div>
        </div>
        <ResponsiveTableScroll>
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50/50 text-slate-500 font-bold text-[11px] uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-4 py-4 w-12 text-center">
                  <input
                    type="checkbox"
                    checked={allTccSelected}
                    onChange={toggleAllTccSelection}
                    disabled={tccHistory.length === 0}
                    aria-label="Select all TCC applications"
                    className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                  />
                </th>
                <th className="px-6 py-4">Certificate Number</th>
                <th className="px-6 py-4">Substance</th>
                <th className="px-6 py-4 text-right">Quantity (MT)</th>
                <th className="px-6 py-4">Submitted</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tccHistory.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400 font-medium">
                    {currentUserRole === 'CLIENT'
                      ? 'No TCC applications yet. Click "Apply for TCC" to submit your first request.'
                      : 'No TCC applications for this client.'}
                  </td>
                </tr>
              ) : (
                tccHistory.map((app) => {
                  const cert = resolveCertificate(app);
                  const statusInfo = tccStatusDisplay(app.status);
                  const StatusIcon = statusInfo.icon;

                  const isTccSelected = selectedTccAppIds.includes(app.id);

                  return (
                    <tr
                      key={app.id}
                      className={`hover:bg-slate-50/50 transition-colors ${isTccSelected ? 'bg-teal-50/40' : ''}`}
                    >
                      <td className="px-4 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={isTccSelected}
                          onChange={() => toggleTccSelection(app.id)}
                          aria-label={`Select ${resolveTccCertificateNumber(app) || resolveChemical(app)}`}
                          className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                        />
                      </td>
                      <td className="px-6 py-4 font-mono text-xs font-bold text-emerald-700">
                        {resolveTccCertificateNumber(app) || '—'}
                      </td>
                      <td className="px-6 py-4 text-slate-600 font-medium">{resolveChemical(app)}</td>
                      <td className="px-6 py-4 text-right font-medium text-slate-700">
                        {Number(app.quantity_mt || 0).toFixed(2)} MT
                      </td>
                      <td className="px-6 py-4 text-slate-600 font-medium" suppressHydrationWarning>
                        {new Date(app.created_at).toLocaleDateString('en-GB')}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${statusInfo.className}`}>
                          <StatusIcon className="h-3.5 w-3.5" />
                          {statusInfo.label}
                        </span>
                        {app.status === 'rejected' && app.rejection_reason && (
                          <p className="text-[10px] text-rose-500 mt-1 max-w-[200px]">{app.rejection_reason}</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center gap-2 items-center">
                          {app.bo_attachment_url && (
                            <a href={app.bo_attachment_url} target="_blank" rel="noopener noreferrer" title="View PO attachment">
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-600">
                                <FileText className="h-4 w-4" />
                              </Button>
                            </a>
                          )}
                          {currentUserRole === 'CLIENT' && canClientEditTccApplication(app.status) && (
                            <Link href={`/client/apply?edit=${app.id}`} title="Edit application">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-amber-700 hover:bg-amber-50"
                              >
                                <PenLine className="h-4 w-4" />
                              </Button>
                            </Link>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-teal-700 hover:bg-teal-50"
                            title="View application"
                            onClick={() => handleOpenTccView(app)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {cert?.id && app.status === 'approved' && (
                            <CertificatePdfDownloadLink
                              pdfUrl={buildTccCertificatePdfDownloadUrl(cert.id)}
                              docxUrl=""
                              fileName={`${cert.certificate_number || 'tcc-certificate'}.pdf`}
                              certificateType="tcc"
                              title="Download certificate PDF"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
                            >
                              <Download className="h-4 w-4" />
                            </CertificatePdfDownloadLink>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </ResponsiveTableScroll>
      </div>
      )}

      {/* 5. Admin Extras (Contacts, Activity, Notes, Actions) - Only visible to Admins, placed at bottom so it doesn't ruin the main dashboard */}
      {showAdminExtras && (
        <div className="mt-12 pt-8 border-t border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-6">Administrative Controls</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            <Card className="border-slate-100 shadow-xs">
              <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
                <CardTitle className="text-base text-slate-800">Account Security</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                <ModalErrorBox message={modalErrors.security} />
                <Button variant="outline" className="w-full justify-start" onClick={() => { setNewEmail(client.email); setModalError('email', null); setEmailModalOpen(true); }}>
                  <Mail className="h-4 w-4 mr-2 text-slate-400" /> Primary Email address
                </Button>
                <Button variant="outline" className="w-full justify-start" onClick={() => { setNewPassword(''); setShowCurrentPassword(false); setShowNewPassword(false); setModalError('password', null); setPasswordModalOpen(true); }}>
                  <Key className="h-4 w-4 mr-2 text-slate-400" /> Reset Password
                </Button>
                <Button variant={user?.is_disabled ? 'primary' : 'outline'} className="w-full justify-start" onClick={handleToggleLogin} isLoading={isPending}>
                  {user?.is_disabled ? <Unlock className="h-4 w-4 mr-2" /> : <Lock className="h-4 w-4 mr-2 text-slate-400" />}
                  {user?.is_disabled ? 'Enable Login' : 'Disable Login'}
                </Button>
                {canDeleteClient && (
                  <>
                    <hr className="border-slate-100 my-1" />
                    <Button
                      variant="outline"
                      className="w-full justify-start text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                      onClick={() => { setModalError('security', null); setDeleteClientOpen(true); }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Delete Compliance Account
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-100 shadow-xs lg:col-span-2">
              <CardHeader className="pb-3 border-b border-slate-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base text-slate-800">Secondary Contacts</CardTitle>
                <Button size="sm" onClick={() => { setModalError('contact', null); setContactModalOpen(true); }}><Plus className="h-4 w-4 mr-1.5" /> Add Contact</Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[250px] overflow-x-auto overflow-y-auto">
                  <table className="w-full text-xs sm:text-sm min-w-[520px]">
                    <tbody className="divide-y divide-slate-100">
                      {contacts.map(c => (
                        <tr key={c.id}>
                          <td className="p-4 font-semibold text-slate-800">{c.first_name} {c.last_name}</td>
                          <td className="p-4 text-slate-500">{c.email}</td>
                          <td className="p-4 text-right">
                            <Button variant="ghost" size="sm" className="text-rose-500" onClick={() => handleDeleteContact(c.id)}><Trash2 className="h-4 w-4" /></Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Internal Notes */}
            <Card className="border-slate-100 shadow-xs">
              <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
                <CardTitle className="text-base text-slate-800 flex items-center gap-2"><StickyNote className="h-4 w-4 text-slate-400" /> Internal Notes</CardTitle>
                <Button size="sm" onClick={() => { setModalError('note', null); setNoteModalOpen(true); }}><Plus className="h-4 w-4 mr-1.5" /> Add Note</Button>
              </CardHeader>
              <CardContent className="pt-4 max-h-[300px] overflow-y-auto space-y-3">
                {internalNotes.map(n => (
                  <div key={n.id} className="p-3 bg-slate-50 border border-slate-100 rounded-lg flex justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-slate-700">{n.author_email} <span className="text-slate-400 font-normal" suppressHydrationWarning>on {new Date(n.created_at).toLocaleDateString()}</span></p>
                      <p className="text-sm text-red-600 font-medium mt-1 whitespace-pre-wrap">{n.note}</p>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-rose-500" onClick={() => handleDeleteNote(n.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                {internalNotes.length === 0 && <div className="text-sm text-slate-400 text-center py-4">No notes added.</div>}
              </CardContent>
            </Card>

            {/* Activity Logs */}
            <Card className="border-slate-100 shadow-xs">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-base text-slate-800 flex items-center gap-2"><History className="h-4 w-4 text-slate-400" /> Activity Logs</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 max-h-[300px] overflow-y-auto">
                <div className="space-y-4">
                  {activityLogs.map((log) => (
                    <div key={log.id} className="flex gap-3">
                      <div className="mt-1 h-2 w-2 rounded-full bg-teal-500 shrink-0"></div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{log.action}</p>
                        <p className="text-xs text-slate-500">{log.description}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5" suppressHydrationWarning>{new Date(log.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                  {activityLogs.length === 0 && <div className="text-sm text-slate-400 text-center py-4">No activity.</div>}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* --- ALL MODALS --- */}
      {/* Email Modal */}
      <Dialog isOpen={isEmailModalOpen} onClose={() => { setEmailModalOpen(false); setModalError('email', null); }} title="Primary Email address">
        <div className="p-2 space-y-4">
          <Input
            label="Primary Email address"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            type="email"
          />
          <ModalErrorBox message={modalErrors.email} />
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={() => { setEmailModalOpen(false); setModalError('email', null); }}>Cancel</Button>
            <Button onClick={handleEmailChange} isLoading={isPending}>Save Changes</Button>
          </div>
        </div>
      </Dialog>
      {/* Password Modal */}
      <Dialog isOpen={isPasswordModalOpen} onClose={() => { setPasswordModalOpen(false); setModalError('password', null); }} title="Reset Password">
        <div className="p-2 space-y-4">
          <div className="w-full flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Current Password</label>
            <div className="relative">
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                readOnly
                value={user?.login_password || ''}
                placeholder={user?.login_password ? undefined : 'Not recorded — reset password to store'}
                className="flex h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 pr-10 py-2 text-sm text-slate-700"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900"
                aria-label={showCurrentPassword ? 'Hide password' : 'Show password'}
              >
                {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="w-full flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">New Password</label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                placeholder="New strong password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 pr-10 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900"
                aria-label={showNewPassword ? 'Hide password' : 'Show password'}
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <ModalErrorBox message={modalErrors.password} />
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={() => { setPasswordModalOpen(false); setModalError('password', null); }}>Cancel</Button>
            <Button onClick={handlePasswordChange} isLoading={isPending}>Set Password</Button>
          </div>
        </div>
      </Dialog>
      {/* Assign RC Certificate */}
      <Dialog
        isOpen={isAssignChemModalOpen}
        onClose={closeAssignChemModal}
        title={assignChemModalMode === 'issue' ? 'Issue RC Certificate' : 'Assign RC Certificate'}
      >
        <div className="p-2 space-y-4">
          <p className="text-sm text-slate-600 font-medium">
            {assignChemModalMode === 'issue' ? (
              <>
                Issue the first RC certificate for{' '}
                <span className="font-bold text-slate-800">{assignChemData.chemical_name || 'this substance'}</span>.
                Fill registration number and confirm dates, then save.
              </>
            ) : (
              <>
                Add a substance to{' '}
                <span className="font-bold text-slate-800">{client.company_name}</span> and issue an RC certificate for
                the selected year. Existing year entries are preserved — duplicate substance + year is not allowed.
              </>
            )}
          </p>
          <div className="space-y-4">
            <div>
              <FormLabel required className="text-sm normal-case mb-1 block">Substance Name</FormLabel>
              <Select
                value={assignChemData.target_chemical_id}
                onChange={(e) => handleChemicalSelectChange(e.target.value)}
                options={[
                  ...clientChemicals.map((cc) => ({
                    value: cc.chemical_id,
                    label: `${cc.chemicals?.chemical_name || 'Unknown'} (CAS: ${cc.chemicals?.cas_number || 'N/A'})`,
                  })),
                  { value: 'new_substance', label: '+ Add New Substance' },
                ]}
              />
            </div>
            {assignChemData.target_chemical_id === 'new_substance' && (
              <div>
                <FormLabel required className="text-sm normal-case mb-1 block">New Substance Name</FormLabel>
                <Input
                  placeholder="e.g. Methanol"
                  value={assignChemData.chemical_name}
                  onChange={(e) => setAssignChemData({ ...assignChemData, chemical_name: e.target.value })}
                  required
                />
              </div>
            )}
            <div>
              <YearPicker
                label="Certificate Year"
                required
                value={assignChemData.certificate_year}
                onChange={(yearValue) => handleAssignYearChange(yearValue)}
                options={availableRcYearOptions}
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Issue date defaults to 01/01 and validity to 31/12 of this year.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FormLabel required className="text-sm normal-case mb-1 block">CAS Number</FormLabel>
                <Input
                  placeholder="e.g. 67-56-1"
                  value={assignChemData.cas_number}
                  onChange={(e) => setAssignChemData({ ...assignChemData, cas_number: e.target.value })}
                  readOnly={assignChemData.target_chemical_id !== 'new_substance'}
                  required
                />
              </div>
              <div>
                <FormLabel required className="text-sm normal-case mb-1 block">EC Number</FormLabel>
                <Input
                  placeholder="e.g. 200-659-6"
                  value={assignChemData.ec_number}
                  onChange={(e) => setAssignChemData({ ...assignChemData, ec_number: e.target.value })}
                  readOnly={assignChemData.target_chemical_id !== 'new_substance'}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FormLabel required className="text-sm normal-case mb-1 block">Registration Number</FormLabel>
                <Input
                  placeholder="e.g. REG-2026-001"
                  value={assignChemData.registration_number}
                  onChange={(e) => setAssignChemData({ ...assignChemData, registration_number: e.target.value })}
                  required
                />
              </div>
              <div>
                <FormLabel className="text-sm normal-case mb-1 block">Tonnage Band</FormLabel>
                <Select
                  value={assignChemData.tonnage_band}
                  onChange={(e) => {
                    const band = e.target.value;
                    const bandMax = getTonnageBandMaxQuota(band);
                    setAssignChemData({
                      ...assignChemData,
                      tonnage_band: band,
                      allocated_quantity: bandMax != null ? String(bandMax) : assignChemData.allocated_quantity,
                    });
                  }}
                  options={[
                    { value: '', label: 'None' },
                    { value: '1-10 tonnes', label: '1-10 tonnes' },
                    { value: '10-100 tonnes', label: '10-100 tonnes' },
                    { value: '100-1000 tonnes', label: '100-1000 tonnes' },
                    { value: '1000+ tonnes', label: '1000+ tonnes' }
                  ]}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FormLabel required className="text-sm normal-case mb-1 block">Issued Date</FormLabel>
                <DatePicker
                  value={assignChemData.issued_date}
                  onChange={(issued_date) => setAssignChemData({ ...assignChemData, issued_date })}
                  min={minIssuedDate}
                  max={maxIssuedDate}
                  required
                />
              </div>
              <div>
                <FormLabel required className="text-sm normal-case mb-1 block">Validated Date</FormLabel>
                <DatePicker
                  value={assignChemData.validated_date}
                  onChange={(validated_date) =>
                    setAssignChemData({ ...assignChemData, validated_date, validity_date: validated_date })
                  }
                  min={minValidatedDate}
                  max={maxValidatedDate}
                  required
                />
              </div>
            </div>
          </div>
          <ModalErrorBox message={modalErrors.assignChem} />
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={closeAssignChemModal}>
              Cancel
            </Button>
            <Button className="bg-teal-700 hover:bg-teal-800" onClick={handleAssignChemical} isLoading={isPending}>
              {assignChemModalMode === 'issue' ? 'Issue RC Certificate' : 'Save Certificate & Generate PDF'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Renew / Edit RC Certificate — RC Certificates tab only */}
      <Dialog
        isOpen={isRcCertModalOpen}
        onClose={closeRcCertModal}
        title={rcCertFormMode === 'renew' ? 'Renew RC Certificate' : 'Edit RC Certificate'}
      >
        <div className="p-2 space-y-4">
          <p className="text-sm text-slate-600 font-medium">
            {rcCertFormMode === 'renew' ? (
              <>
                Issue a new RC certificate for{' '}
                <span className="font-bold text-slate-800">{assignChemData.chemical_name || 'this substance'}</span>.
                The previous certificate stays on record. Use a different validity period.
              </>
            ) : (
              <>
                Update RC certificate details for{' '}
                <span className="font-bold text-slate-800">{assignChemData.chemical_name || 'this substance'}</span>.
              </>
            )}
          </p>
          <div className="space-y-4">
            {rcCertFormMode === 'renew' && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
                <p>
                  <span className="font-semibold">Previous year:</span>{' '}
                  {String(Number(assignChemData.certificate_year) - 1)}
                </p>
                <p className="mt-1">Substance details are copied from the latest certificate.</p>
              </div>
            )}
            <div>
              <FormLabel required className="text-sm normal-case mb-1 block">Substance Name</FormLabel>
              <Input
                placeholder="e.g. Methanol"
                value={assignChemData.chemical_name}
                onChange={(e) => setAssignChemData({ ...assignChemData, chemical_name: e.target.value })}
                readOnly={rcCertFormMode === 'renew'}
                required
              />
            </div>
            <div>
              <YearPicker
                label={rcCertFormMode === 'renew' ? 'New Certificate Year' : 'Certificate Year'}
                required
                value={assignChemData.certificate_year}
                onChange={(yearValue) => handleAssignYearChange(yearValue)}
                options={rcYearOptions}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FormLabel required className="text-sm normal-case mb-1 block">CAS Number</FormLabel>
                <Input placeholder="e.g. 67-56-1" value={assignChemData.cas_number} onChange={(e) => setAssignChemData({ ...assignChemData, cas_number: e.target.value })} required />
              </div>
              <div>
                <FormLabel required className="text-sm normal-case mb-1 block">EC Number</FormLabel>
                <Input placeholder="e.g. 200-659-6" value={assignChemData.ec_number} onChange={(e) => setAssignChemData({ ...assignChemData, ec_number: e.target.value })} required />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FormLabel required className="text-sm normal-case mb-1 block">Registration Number</FormLabel>
                <Input
                  placeholder="e.g. REG-2026-001"
                  value={assignChemData.registration_number}
                  onChange={(e) => setAssignChemData({ ...assignChemData, registration_number: e.target.value })}
                  required
                />
              </div>
              <div>
                <FormLabel className="text-sm normal-case mb-1 block">Allocated Quota (MT)</FormLabel>
                <Select 
                  value={assignChemData.tonnage_band}
                  onChange={(e) => {
                    const band = e.target.value;
                    const bandMax = getTonnageBandMaxQuota(band);
                    setAssignChemData({
                      ...assignChemData,
                      tonnage_band: band,
                      allocated_quantity: bandMax != null ? String(bandMax) : assignChemData.allocated_quantity,
                    });
                  }}
                  options={[
                    { value: '', label: 'None' },
                    { value: '1-10 tonnes', label: '1-10 tonnes' },
                    { value: '10-100 tonnes', label: '10-100 tonnes' },
                    { value: '100-1000 tonnes', label: '100-1000 tonnes' },
                    { value: '1000+ tonnes', label: '1000+ tonnes' }
                  ]}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FormLabel required className="text-sm normal-case mb-1 block">Issued Date</FormLabel>
                <DatePicker
                  value={assignChemData.issued_date}
                  onChange={(issued_date) => setAssignChemData({ ...assignChemData, issued_date })}
                  min={minIssuedDate}
                  max={maxIssuedDate}
                  required
                />
              </div>
              <div>
                <FormLabel required className="text-sm normal-case mb-1 block">Validated Date</FormLabel>
                <DatePicker
                  value={assignChemData.validated_date}
                  onChange={(validated_date) =>
                    setAssignChemData({ ...assignChemData, validated_date, validity_date: validated_date })
                  }
                  min={minValidatedDate}
                  max={maxValidatedDate}
                  required
                />
              </div>
            </div>
          </div>
          <ModalErrorBox message={modalErrors.assignChem} />
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={closeRcCertModal}>
              Cancel
            </Button>
            <Button
              className="bg-teal-700 hover:bg-teal-800"
              onClick={rcCertFormMode === 'renew' ? handleRenewRc : handleEditSubstanceRc}
              isLoading={isPending}
            >
              {rcCertFormMode === 'renew' ? 'Issue Certificate' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Edit Substance Allocation — quota/chemical only */}
      <Dialog
        isOpen={isEditSubstanceModalOpen}
        onClose={() => {
          setEditSubstanceModalOpen(false);
          setModalError('substances', null);
        }}
        title="Edit Substance Allocation"
      >
        <div className="p-2 space-y-4">
          <p className="text-sm text-slate-600 font-medium">
            Update substance and quota allocation. RC certificates are managed on the client overview page.
          </p>
          <div className="space-y-4">
            <div>
              <FormLabel required className="text-sm normal-case mb-1 block">Substance Name</FormLabel>
              <Input
                value={editSubstanceData.chemical_name}
                onChange={(e) => setEditSubstanceData({ ...editSubstanceData, chemical_name: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FormLabel className="text-sm normal-case mb-1 block">CAS Number</FormLabel>
                <Input
                  value={editSubstanceData.cas_number}
                  onChange={(e) => setEditSubstanceData({ ...editSubstanceData, cas_number: e.target.value })}
                />
              </div>
              <div>
                <FormLabel required className="text-sm normal-case mb-1 block">EC Number</FormLabel>
                <Input
                  value={editSubstanceData.ec_number}
                  onChange={(e) => setEditSubstanceData({ ...editSubstanceData, ec_number: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FormLabel className="text-sm normal-case mb-1 block">Tonnage Band</FormLabel>
                <Select
                  value={editSubstanceData.tonnage_band}
                  onChange={(e) => setEditSubstanceData({ ...editSubstanceData, tonnage_band: e.target.value })}
                  options={[
                    { value: '', label: 'None' },
                    { value: '1-10 tonnes', label: '1-10 tonnes' },
                    { value: '10-100 tonnes', label: '10-100 tonnes' },
                    { value: '100-1000 tonnes', label: '100-1000 tonnes' },
                    { value: '1000+ tonnes', label: '1000+ tonnes' },
                  ]}
                />
              </div>
              <div>
                <FormLabel className="text-sm normal-case mb-1 block">Validity Date</FormLabel>
                <DatePicker
                  value={editSubstanceData.validity_date}
                  onChange={(validity_date) => setEditSubstanceData({ ...editSubstanceData, validity_date })}
                />
              </div>
            </div>
          </div>
          <ModalErrorBox message={modalErrors.substances} />
          <div className="flex justify-end gap-3 mt-6">
            <Button
              variant="outline"
              onClick={() => {
                setEditSubstanceModalOpen(false);
                setModalError('substances', null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleEditSubstanceAllocation} isLoading={isPending}>
              Save Changes
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Add Contact Modal */}
      <Dialog isOpen={isContactModalOpen} onClose={() => { setContactModalOpen(false); setModalError('contact', null); }} title="Add Secondary Contact">
        <div className="p-2 space-y-4">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input placeholder="First Name" value={contactData.first_name} onChange={e => setContactData({ ...contactData, first_name: e.target.value })} />
              <Input placeholder="Last Name" value={contactData.last_name} onChange={e => setContactData({ ...contactData, last_name: e.target.value })} />
            </div>
            <Input placeholder="Email Address" type="email" value={contactData.email} onChange={e => setContactData({ ...contactData, email: e.target.value })} />
            <Input placeholder="Phone Number" value={contactData.phone} onChange={e => setContactData({ ...contactData, phone: e.target.value })} />
            <Input placeholder="Role / Position" value={contactData.role} onChange={e => setContactData({ ...contactData, role: e.target.value })} />
          </div>
          <ModalErrorBox message={modalErrors.contact} />
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={() => { setContactModalOpen(false); setModalError('contact', null); }}>Cancel</Button>
            <Button onClick={handleAddContact} isLoading={isPending}>Add Contact</Button>
          </div>
        </div>
      </Dialog>
      {/* Add Note Modal */}
      <Dialog isOpen={isNoteModalOpen} onClose={() => { setNoteModalOpen(false); setModalError('note', null); }} title="Add Internal Note">
        <div className="p-2 space-y-4">
          <textarea 
            className="w-full h-32 p-3 border border-slate-200 rounded-lg text-sm"
            placeholder="Type confidential note here..."
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
          ></textarea>
          <ModalErrorBox message={modalErrors.note} />
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => { setNoteModalOpen(false); setModalError('note', null); }}>Cancel</Button>
            <Button onClick={handleAddNote} isLoading={isPending}>Save Note</Button>
          </div>
        </div>
      </Dialog>

      {isTccViewOpen && (
      <TccApplicationViewDialog
        app={viewTccApp}
        isOpen={isTccViewOpen}
        onClose={() => setIsTccViewOpen(false)}
        allowReview={canReviewTcc}
        allowAdminEdit={canManageRc && hasEuReach}
        onApplicationUpdated={(updates) => {
          setViewTccApp((prev) => (prev ? { ...prev, ...updates } : prev));
        }}
        getStatusBadge={getTccStatusBadge}
        onApprove={() => handleTccViewThenAction('approved')}
        onReject={() => handleTccViewThenAction('rejected')}
        onRequestChanges={() => handleTccViewThenAction('changes_required')}
        emailDefaults={emailDefaults}
      />
      )}

      <Dialog
        isOpen={isTccActionOpen}
        onClose={() => setIsTccActionOpen(false)}
        title={
          tccActionType === 'approved'
            ? 'Confirm Approval & Issue Certificate'
            : tccActionType === 'rejected'
            ? 'Reject Application'
            : 'Request Application Revisions'
        }
      >
        <div className="space-y-4">
          {tccActionType === 'approved' ? (
            <>
              <p className="text-sm text-slate-600 font-medium leading-relaxed">
                Are you sure you want to approve this application from{' '}
                <span className="font-bold text-slate-800">{selectedTccApp?.clients.company_name}</span>?
              </p>
              <div className="bg-slate-50 border rounded-lg p-3 text-xs space-y-1.5 text-slate-600 font-medium">
                <div>
                  <span className="font-bold text-slate-400 uppercase tracking-wider block text-[9px]">Substance</span>
                  <span className="font-bold text-slate-800">{selectedTccApp?.chemicals.chemical_name}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <span className="font-bold text-slate-400 uppercase tracking-wider block text-[9px]">Requested</span>
                    <span className="font-bold text-slate-800">{selectedTccApp?.quantity_mt} MT</span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-400 uppercase tracking-wider block text-[9px]">Available Quota</span>
                    <span className="font-bold text-slate-800">
                      {selectedTccApp?.rc_remaining_quota ??
                        selectedTccApp?.chemicals.available_quantity ??
                        0}{' '}
                      MT
                    </span>
                    {selectedTccApp?.rc_period_certificate && (
                      <span className="block text-[10px] text-slate-500 font-medium mt-0.5">
                        RC period: {selectedTccApp.rc_period_certificate}
                      </span>
                    )}
                  </div>
                </div>
                {selectedTccApp?.bo_attachment_url && (
                  <a
                    href={selectedTccApp.bo_attachment_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
                  >
                    <Download className="h-3.5 w-3.5" />
                    View PO: {selectedTccApp.bo_attachment_name || 'Attachment'}
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
                value={tccRejectionReason}
                onChange={(e) => setTccRejectionReason(e.target.value)}
                placeholder={
                  tccActionType === 'rejected'
                    ? 'Reason for rejection…'
                    : 'Detail the modifications needed…'
                }
                className="w-full text-sm p-3 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none font-medium text-slate-700"
                required
              />
            </>
          )}

          {tccActionError && (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-sm font-semibold flex items-start gap-2.5">
              <AlertCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold mb-1">Decision Error</h4>
                <p className="text-xs leading-relaxed font-medium">{tccActionError}</p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsTccActionOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleProcessTccAction}
              isLoading={isPending}
              disabled={isPending}
              className={
                tccActionType === 'approved'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : tccActionType === 'rejected'
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : 'bg-amber-600 hover:bg-amber-700 text-white'
              }
            >
              {tccActionType === 'approved'
                ? 'Approve & Issue Certificate'
                : tccActionType === 'rejected'
                ? 'Reject Permit'
                : 'Send Revision Request'}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog isOpen={isDeleteClientOpen} onClose={() => setDeleteClientOpen(false)} title="Confirm Deletion">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 font-medium">
            Are you sure you want to delete{' '}
            <span className="font-bold text-slate-800">{client.company_name}</span>?
          </p>
          <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg text-xs text-rose-700 font-semibold space-y-1">
            <p className="font-bold">WARNING: THIS ACTION IS PERMANENT & CANNOT BE UNDONE.</p>
            <p>
              Deleting this compliance account will immediately revoke all active certificates, cancel pending TCC permits, erase contact officer profiles, and delete the user credentials.
            </p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteClientOpen(false)}
              disabled={isPending}
            >
              No, Keep Client
            </Button>
            <Button
              type="button"
              onClick={handleDeleteClient}
              isLoading={isPending}
              disabled={isPending}
              className="bg-rose-600 hover:bg-rose-700 text-white border-rose-600 hover:border-rose-700"
            >
              Yes, Delete Permanently
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
