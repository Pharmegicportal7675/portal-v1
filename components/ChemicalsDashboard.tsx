'use client';

import { useState, useTransition, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  createChemicalAction,
  updateChemicalAction,
  trashChemicalAction,
  restoreChemicalAction,
  permanentDeleteChemicalAction,
} from '@/actions/chemicals';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { DatePicker } from './ui/DatePicker';
import { Select } from './ui/Select';
import { Badge } from './ui/Badge';
import { Dialog } from './ui/Dialog';
import { TableColumnFilter } from './ui/TableColumnFilter';
import { TableDataExport } from '@/components/TableDataExport';
import { ResponsiveTableScroll } from './ui/ResponsiveTableScroll';
import { formatDisplayDate } from '@/lib/date-filter';
import type { CsvColumn } from '@/lib/export-csv';
import { toast } from '@/store/toast';
import {
  Plus,
  Edit2,
  Trash2,
  FlaskConical,
  Activity,
  AlertCircle,
  Calendar,
  Weight,
  Building2,
  RotateCcw,
  Archive,
} from 'lucide-react';

interface Chemical {
  id: string;
  chemical_name: string;
  cas_number: string;
  ec_number: string | null;
  tonnage_band: string | null;
  validity_date: string | null;
  available_quantity: number;
  exported_quantity: number;
  status: 'active' | 'inactive';
  created_at: string;
  company_names?: string[];
  /** Sum of client_chemicals.available_quantity (live remaining) */
  remaining_quota?: number;
  /** Sum of approved TCC quantity_mt for this substance */
  exported_mt?: number;
  /** remaining_quota + exported_mt */
  total_quota?: number;
}

function formatMt(value: number | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toFixed(1) : '0.0';
}

const INITIAL_COLUMN_FILTERS = {
  company: '',
  substance: '',
  regulatory: '',
  tonnage: 'all',
  availableQuota: '',
  exported: '',
  status: 'all',
};

function matchesText(haystack: string, needle: string) {
  if (!needle.trim()) return true;
  return haystack.toLowerCase().includes(needle.trim().toLowerCase());
}

type TrashedChemical = Pick<
  Chemical,
  'id' | 'chemical_name' | 'cas_number' | 'ec_number' | 'tonnage_band' | 'validity_date' | 'status'
>;

interface ChemicalsDashboardProps {
  initialChemicals: Chemical[];
  initialTrashedChemicals?: TrashedChemical[];
}

const CHEMICAL_EXPORT_COLUMNS: CsvColumn<Chemical>[] = [
  { header: 'Companies', value: (chem) => (chem.company_names || []).join('; ') },
  { header: 'Substance', value: (chem) => chem.chemical_name },
  { header: 'CAS Number', value: (chem) => chem.cas_number },
  { header: 'EC Number', value: (chem) => chem.ec_number },
  { header: 'Tonnage Band', value: (chem) => chem.tonnage_band },
  { header: 'Remaining Quota (MT)', value: (chem) => formatMt(chem.remaining_quota) },
  { header: 'Exported (MT)', value: (chem) => formatMt(chem.exported_mt) },
  { header: 'Total Quota (MT)', value: (chem) => formatMt(chem.total_quota) },
  { header: 'Validity Date', value: (chem) => formatDisplayDate(chem.validity_date) },
  { header: 'Status', value: (chem) => chem.status },
];

export default function ChemicalsDashboard({
  initialChemicals,
  initialTrashedChemicals = [],
}: ChemicalsDashboardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [columnFilters, setColumnFilters] = useState(INITIAL_COLUMN_FILTERS);
  const [chemicals, setChemicals] = useState<Chemical[]>(initialChemicals);
  const [trashedChemicals, setTrashedChemicals] = useState<TrashedChemical[]>(initialTrashedChemicals);
  const [selectedChemicalIds, setSelectedChemicalIds] = useState<string[]>([]);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [isPermanentDeleteOpen, setIsPermanentDeleteOpen] = useState(false);

  const [selectedChemical, setSelectedChemical] = useState<Chemical | null>(null);
  const [selectedTrashed, setSelectedTrashed] = useState<TrashedChemical | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    chemical_name: '',
    cas_number: '',
    ec_number: '',
    tonnage_band: '10-100 tonnes',
    validity_date: '',
    available_quantity: '0',
    status: 'active' as 'active' | 'inactive',
  });
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setChemicals(initialChemicals);
    setTrashedChemicals(initialTrashedChemicals);
  }, [initialChemicals, initialTrashedChemicals]);

  const tonnageFilterOptions = useMemo(() => {
    const bands = [
      ...new Set(chemicals.map((c) => c.tonnage_band).filter((b): b is string => Boolean(b))),
    ].sort();
    return [
      { value: 'all', label: 'All bands' },
      ...bands.map((b) => ({ value: b, label: b })),
    ];
  }, [chemicals]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (columnFilters.company.trim()) n++;
    if (columnFilters.substance.trim()) n++;
    if (columnFilters.regulatory.trim()) n++;
    if (columnFilters.tonnage !== 'all') n++;
    if (columnFilters.availableQuota.trim()) n++;
    if (columnFilters.exported.trim()) n++;
    if (columnFilters.status !== 'all') n++;
    return n;
  }, [columnFilters]);

  const filteredChemicals = useMemo(() => {
    return chemicals.filter((chem) => {
      const companies = (chem.company_names || []).join(' ');
      if (!matchesText(companies, columnFilters.company)) return false;
      if (!matchesText(chem.chemical_name, columnFilters.substance)) return false;

      const regulatoryHaystack = [chem.cas_number, chem.ec_number || ''].join(' ');
      if (!matchesText(regulatoryHaystack, columnFilters.regulatory)) return false;

      if (columnFilters.tonnage !== 'all' && chem.tonnage_band !== columnFilters.tonnage) return false;

      if (
        columnFilters.availableQuota.trim() &&
        !String(chem.remaining_quota ?? 0).includes(columnFilters.availableQuota.trim())
      ) {
        return false;
      }

      if (
        columnFilters.exported.trim() &&
        !String(chem.exported_mt ?? 0).includes(columnFilters.exported.trim())
      ) {
        return false;
      }

      if (columnFilters.status !== 'all' && chem.status !== columnFilters.status) return false;

      return true;
    });
  }, [chemicals, columnFilters]);

  const updateColumnFilter = (key: keyof typeof INITIAL_COLUMN_FILTERS, value: string) => {
    setColumnFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearAllFilters = () => setColumnFilters(INITIAL_COLUMN_FILTERS);

  const filteredChemicalIds = useMemo(
    () => filteredChemicals.map((chem) => chem.id),
    [filteredChemicals]
  );

  const allFilteredSelected =
    filteredChemicalIds.length > 0 && filteredChemicalIds.every((id) => selectedChemicalIds.includes(id));

  const toggleChemicalSelection = (id: string) => {
    setSelectedChemicalIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );
  };

  const toggleSelectAllFilteredChemicals = () => {
    setSelectedChemicalIds(allFilteredSelected ? [] : [...filteredChemicalIds]);
  };

  const handleOpenCreate = () => {
    setFormError(null);
    setFormData({
      chemical_name: '',
      cas_number: '',
      ec_number: '',
      tonnage_band: '10-100 tonnes',
      validity_date: new Date().toISOString().split('T')[0],
      available_quantity: '0',
      status: 'active',
    });
    setIsCreateOpen(true);
  };

  const handleCreateChemical = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    startTransition(async () => {
      const payload = new FormData();
      payload.append('chemical_name', formData.chemical_name);
      payload.append('cas_number', formData.cas_number);
      payload.append('ec_number', formData.ec_number);
      payload.append('tonnage_band', formData.tonnage_band);
      payload.append('validity_date', formData.validity_date);
      payload.append('available_quantity', formData.available_quantity);
      payload.append('status', formData.status);

      const res = await createChemicalAction(null, payload);
      if (res.success) {
        toast.success(res.message || 'Substance added to compliance database.');
        setIsCreateOpen(false);
        router.refresh();
      } else {
        setFormError(res.error || 'Failed to create substance.');
        toast.error(res.error || 'Failed to create substance.');
      }
    });
  };

  const handleOpenEdit = (chem: Chemical) => {
    setFormError(null);
    setSelectedChemical(chem);
    setFormData({
      chemical_name: chem.chemical_name,
      cas_number: chem.cas_number,
      ec_number: chem.ec_number || '',
      tonnage_band: chem.tonnage_band || '10-100 tonnes',
      validity_date: chem.validity_date ? new Date(chem.validity_date).toISOString().split('T')[0] : '',
      available_quantity: String(chem.available_quantity),
      status: chem.status,
    });
    setIsEditOpen(true);
  };

  const handleUpdateChemical = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChemical) return;
    setFormError(null);

    if (!formData.ec_number.trim()) {
      setFormError('EC number is required.');
      toast.error('EC number is required.');
      return;
    }

    startTransition(async () => {
      const res = await updateChemicalAction(selectedChemical.id, {
        chemical_name: formData.chemical_name,
        cas_number: formData.cas_number,
        ec_number: formData.ec_number.trim(),
        tonnage_band: formData.tonnage_band,
        validity_date: formData.validity_date,
        available_quantity: Number(formData.available_quantity),
        status: formData.status,
      });

      if (res.success) {
        toast.success(res.message || 'Substance updated.');
        setIsEditOpen(false);
        router.refresh();
      } else {
        setFormError(res.error || 'Failed to update substance.');
        toast.error(res.error || 'Failed to update substance.');
      }
    });
  };

  const handleOpenTrash = (chem: Chemical) => {
    setSelectedChemical(chem);
    setIsTrashOpen(true);
  };

  const handleMoveToTrash = async () => {
    if (!selectedChemical) return;

    startTransition(async () => {
      const res = await trashChemicalAction(selectedChemical.id);
      if (res.success) {
        toast.success(res.message || 'Substance moved to trash.');
        setIsTrashOpen(false);
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to move substance to trash.');
      }
    });
  };

  const handleRestoreChemical = (chem: TrashedChemical) => {
    startTransition(async () => {
      const res = await restoreChemicalAction(chem.id);
      if (res.success) {
        toast.success(res.message || 'Substance restored.');
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to restore substance.');
      }
    });
  };

  const handleOpenPermanentDelete = (chem: TrashedChemical) => {
    setSelectedTrashed(chem);
    setIsPermanentDeleteOpen(true);
  };

  const handlePermanentDelete = async () => {
    if (!selectedTrashed) return;

    startTransition(async () => {
      const res = await permanentDeleteChemicalAction(selectedTrashed.id);
      if (res.success) {
        toast.success(res.message || 'Substance permanently deleted.');
        setIsPermanentDeleteOpen(false);
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to permanently delete substance.');
      }
    });
  };

  const getStatusBadge = (status: string) => {
    return status === 'active' ? (
      <Badge variant="success">Active</Badge>
    ) : (
      <Badge variant="danger">Inactive</Badge>
    );
  };

  return (
    <div className="space-y-8 animate-slide-in">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Substance Registry</h1>
          <p className="text-sm text-slate-500 font-medium">
            Manage tonnage limits, substance identification numbers, and export metrics of the compliance registry.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:self-start">
          <TableDataExport
            filename="chemical-inventory"
            columns={CHEMICAL_EXPORT_COLUMNS}
            filteredRows={filteredChemicals}
            selectedIds={selectedChemicalIds}
            getRowId={(chem) => chem.id}
          />
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Add Substance
          </Button>
        </div>
      </div>

      {/* Chemicals inventory table */}
      <Card className="border-slate-100 overflow-hidden">
        {(activeFilterCount > 0 || selectedChemicalIds.length > 0) && (
          <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-slate-600">
              Showing {filteredChemicals.length} of {chemicals.length} substances
              {activeFilterCount > 0 && (
                <span className="text-primary ml-1">({activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active)</span>
              )}
              {selectedChemicalIds.length > 0 && (
                <span className="text-teal-700 ml-2">· {selectedChemicalIds.length} selected</span>
              )}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={clearAllFilters} className="h-8 text-xs">
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Clear all filters
            </Button>
          </div>
        )}
        <ResponsiveTableScroll>
          <table className="w-full text-left border-collapse min-w-[1100px] text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-100 align-top">
                <th className="p-3 w-12 text-center">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAllFilteredChemicals}
                    disabled={filteredChemicalIds.length === 0}
                    aria-label="Select all filtered substances"
                    className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                  />
                </th>
                <th className="p-3 min-w-[160px]">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Company Name</span>
                  <TableColumnFilter
                    value={columnFilters.company}
                    onChange={(v) => updateColumnFilter('company', v)}
                    placeholder="Filter company…"
                  />
                </th>
                <th className="p-3 min-w-[200px]">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Substance Details</span>
                  <TableColumnFilter
                    value={columnFilters.substance}
                    onChange={(v) => updateColumnFilter('substance', v)}
                    placeholder="Filter name…"
                  />
                </th>
                <th className="p-3 min-w-[140px]">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Regulatory IDs</span>
                  <TableColumnFilter
                    value={columnFilters.regulatory}
                    onChange={(v) => updateColumnFilter('regulatory', v)}
                    placeholder="CAS / EC…"
                  />
                </th>
                <th className="p-3 min-w-[130px]">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tonnage Band</span>
                  <TableColumnFilter
                    type="select"
                    value={columnFilters.tonnage}
                    onChange={(v) => updateColumnFilter('tonnage', v)}
                    options={tonnageFilterOptions}
                  />
                </th>
                <th className="p-3 min-w-[150px]">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Quota (Remaining)</span>
                  <TableColumnFilter
                    value={columnFilters.availableQuota}
                    onChange={(v) => updateColumnFilter('availableQuota', v)}
                    placeholder="MT…"
                  />
                </th>
                <th className="p-3 min-w-[110px]">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Exported</span>
                  <TableColumnFilter
                    value={columnFilters.exported}
                    onChange={(v) => updateColumnFilter('exported', v)}
                    placeholder="MT…"
                  />
                </th>
                <th className="p-3 min-w-[110px]">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Status</span>
                  <TableColumnFilter
                    type="select"
                    value={columnFilters.status}
                    onChange={(v) => updateColumnFilter('status', v)}
                    options={[
                      { value: 'all', label: 'All statuses' },
                      { value: 'active', label: 'Active' },
                      { value: 'inactive', label: 'Inactive' },
                    ]}
                  />
                </th>
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right min-w-[90px]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredChemicals.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400 font-medium">
                    No substances found matching your column filters.
                  </td>
                </tr>
              ) : (
                filteredChemicals.map((chem) => {
                  const isSelected = selectedChemicalIds.includes(chem.id);
                  return (
                  <tr
                    key={chem.id}
                    className={`hover:bg-slate-50/50 transition-colors group ${isSelected ? 'bg-teal-50/40' : ''}`}
                  >
                    <td className="p-4 text-center align-top">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleChemicalSelection(chem.id)}
                        aria-label={`Select ${chem.chemical_name}`}
                        className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                      />
                    </td>
                    <td className="p-4 align-top">
                      {chem.company_names && chem.company_names.length > 0 ? (
                        <div className="space-y-1">
                          {chem.company_names.slice(0, 2).map((name) => (
                            <div key={name} className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                              <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span className="line-clamp-2">{name}</span>
                            </div>
                          ))}
                          {chem.company_names.length > 2 && (
                            <span className="text-[11px] font-bold text-primary">
                              +{chem.company_names.length - 2} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic font-medium">Not assigned</span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-emerald-50 text-primary flex items-center justify-center font-bold">
                          <FlaskConical className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-800 group-hover:text-primary transition-colors">
                            {chem.chemical_name}
                          </div>
                          <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5 mt-0.5">
                            <Calendar className="h-3 w-3" />
                            <span>Expires: {chem.validity_date ? new Date(chem.validity_date).toLocaleDateString() : 'N/A'}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="space-y-0.5 text-xs">
                        <div className="font-semibold text-slate-700">
                          <span className="text-slate-400 font-medium">CAS:</span> {chem.cas_number}
                        </div>
                        {chem.ec_number && (
                          <div className="font-semibold text-slate-700">
                            <span className="text-slate-400 font-medium">EC:</span> {chem.ec_number}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <Badge variant="outline" className="border-slate-200 bg-slate-50/20 text-slate-600 font-semibold">
                        {chem.tonnage_band || 'N/A'}
                      </Badge>
                    </td>
                    <td className="p-4 align-top min-w-[150px]">
                      {(() => {
                        const remaining = Number(chem.remaining_quota ?? 0);
                        const total = Number(chem.total_quota ?? 0);
                        const exported = Number(chem.exported_mt ?? 0);
                        const pct = total > 0 ? (exported / total) * 100 : 0;
                        return (
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-end text-xs gap-2">
                              <span className="font-bold text-slate-800 flex items-center gap-1">
                                <Weight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                {formatMt(remaining)} MT
                              </span>
                              <span className="text-slate-400 font-medium whitespace-nowrap">
                                of {formatMt(total)} MT
                              </span>
                            </div>
                            {total > 0 ? (
                              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="h-full bg-teal-700 rounded-full transition-all"
                                  style={{ width: `${Math.min(100, Math.max(4, pct))}%` }}
                                  title={`${formatMt(exported)} MT exported (${pct.toFixed(0)}%)`}
                                />
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400 font-medium italic">No quota assigned</span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="p-4 text-slate-600 font-medium align-top">
                      <div className="flex items-center gap-1">
                        <Activity className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="font-bold text-slate-700">{formatMt(chem.exported_mt)} MT</span>
                      </div>
                      <p className="text-[11px] text-slate-400 font-medium mt-0.5">approved exports</p>
                    </td>
                    <td className="p-4">{getStatusBadge(chem.status)}</td>
                    <td className="p-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => handleOpenEdit(chem)}
                          className="p-2 text-slate-500 hover:text-primary hover:bg-slate-100 rounded-md transition-all cursor-pointer"
                          title="Edit Substance"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleOpenTrash(chem)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-all cursor-pointer"
                          title="Move to Trash"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
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

      {/* Trash box */}
      {trashedChemicals.length > 0 && (
        <Card className="border-dashed border-slate-300 bg-slate-50/80 overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Archive className="h-4 w-4 text-slate-500" />
              <h2 className="font-bold text-slate-600 text-sm">Deleted Inventory (Trash)</h2>
            </div>
            <span className="text-xs text-slate-400 font-medium">
              Restore to bring back · Delete permanently to remove forever
            </span>
          </div>
          <ResponsiveTableScroll>
            <table className="w-full text-left border-collapse text-sm min-w-[640px]">
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-200">
                  <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Substance</th>
                  <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">CAS</th>
                  <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trashedChemicals.map((chem) => (
                  <tr key={chem.id} className="text-slate-600">
                    <td className="p-3 font-semibold text-slate-700">{chem.chemical_name}</td>
                    <td className="p-3 font-mono text-xs text-slate-500">{chem.cas_number}</td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-[10px] border-slate-300 text-slate-500">
                        TRASHED
                      </Badge>
                    </td>
                    <td className="p-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          disabled={isPending}
                          onClick={() => handleRestoreChemical(chem)}
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-1" />
                          Restore
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 text-xs bg-rose-600 hover:bg-rose-700 text-white border-rose-600"
                          disabled={isPending}
                          onClick={() => handleOpenPermanentDelete(chem)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Delete permanently
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTableScroll>
        </Card>
      )}

      {/* 1. Create Chemical Modal */}
      <Dialog isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Register Substance">
        <form onSubmit={handleCreateChemical} className="space-y-4">
          <Input
            label="Substance Name"
            placeholder="e.g. Dimethylformamide (DMF)"
            value={formData.chemical_name}
            onChange={(e) => setFormData({ ...formData, chemical_name: e.target.value })}
            required
          />
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            <Input
              label="CAS Number"
              placeholder="e.g. 68-12-2"
              value={formData.cas_number}
              onChange={(e) => setFormData({ ...formData, cas_number: e.target.value })}
              required
            />
            <Input
              label="EC Number"
              placeholder="e.g. 200-679-5"
              value={formData.ec_number}
              onChange={(e) => setFormData({ ...formData, ec_number: e.target.value })}
              required
            />
          </div>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            <Select
              label="Tonnage Band"
              value={formData.tonnage_band}
              onChange={(e) => setFormData({ ...formData, tonnage_band: e.target.value })}
              options={[
                { value: '1-10 tonnes', label: '1-10 tonnes' },
                { value: '10-100 tonnes', label: '10-100 tonnes' },
                { value: '100-1000 tonnes', label: '100-1000 tonnes' },
                { value: '1000+ tonnes', label: '1000+ tonnes' },
              ]}
            />
            <DatePicker
              label="Validity Expiration Date"
              value={formData.validity_date}
              onChange={(validity_date) => setFormData({ ...formData, validity_date })}
              required
            />
          </div>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            <Input
              type="number"
              step="0.01"
              label="Initial Available Quota (MT)"
              value={formData.available_quantity}
              onChange={(e) => setFormData({ ...formData, available_quantity: e.target.value })}
              required
            />
            <Select
              label="Initial Registry Status"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
              options={[
                { value: 'active', label: 'Active Compliance Substance' },
                { value: 'inactive', label: 'Inactive / Barred Substance' },
              ]}
            />
          </div>

          {formError && (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-sm font-semibold flex items-start gap-2.5 w-full my-4">
              <AlertCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
              <div className="flex-1 text-left">
                <h4 className="font-bold mb-1">Registration Error</h4>
                <p className="text-xs leading-relaxed font-medium">{formError}</p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCreateOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={isPending} disabled={isPending}>
              Register Substance
            </Button>
          </div>
        </form>
      </Dialog>

      {/* 2. Edit Chemical Modal */}
      <Dialog isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title={`Edit Substance: ${selectedChemical?.chemical_name}`}>
        <form onSubmit={handleUpdateChemical} className="space-y-4">
          <Input
            label="Substance Name"
            value={formData.chemical_name}
            onChange={(e) => setFormData({ ...formData, chemical_name: e.target.value })}
            required
          />
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            <Input
              label="CAS Number"
              value={formData.cas_number}
              onChange={(e) => setFormData({ ...formData, cas_number: e.target.value })}
              required
            />
            <Input
              label="EC Number"
              value={formData.ec_number}
              onChange={(e) => setFormData({ ...formData, ec_number: e.target.value })}
              required
            />
          </div>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            <Select
              label="Tonnage Band"
              value={formData.tonnage_band}
              onChange={(e) => setFormData({ ...formData, tonnage_band: e.target.value })}
              options={[
                { value: '1-10 tonnes', label: '1-10 tonnes' },
                { value: '10-100 tonnes', label: '10-100 tonnes' },
                { value: '100-1000 tonnes', label: '100-1000 tonnes' },
                { value: '1000+ tonnes', label: '1000+ tonnes' },
              ]}
            />
            <DatePicker
              label="Validity Expiration Date"
              value={formData.validity_date}
              onChange={(validity_date) => setFormData({ ...formData, validity_date })}
              required
            />
          </div>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            <Input
              type="number"
              step="0.01"
              label="Available Quota Quantity (MT)"
              value={formData.available_quantity}
              onChange={(e) => setFormData({ ...formData, available_quantity: e.target.value })}
              required
            />
            <Select
              label="Status"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
              options={[
                { value: 'active', label: 'Active Compliance Substance' },
                { value: 'inactive', label: 'Inactive / Barred Substance' },
              ]}
            />
          </div>

          {formError && (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-sm font-semibold flex items-start gap-2.5 w-full my-4">
              <AlertCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
              <div className="flex-1 text-left">
                <h4 className="font-bold mb-1">Substance Update Error</h4>
                <p className="text-xs leading-relaxed font-medium">{formError}</p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={isPending} disabled={isPending}>
              Save Substance Changes
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Move to trash */}
      <Dialog isOpen={isTrashOpen} onClose={() => setIsTrashOpen(false)} title="Move to Trash">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 font-medium">
            Move <span className="font-bold text-slate-800">{selectedChemical?.chemical_name}</span> to trash?
            It will be hidden from the registry until restored or permanently deleted.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsTrashOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleMoveToTrash}
              isLoading={isPending}
              disabled={isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white border-amber-600"
            >
              Move to Trash
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Permanent delete from trash */}
      <Dialog
        isOpen={isPermanentDeleteOpen}
        onClose={() => setIsPermanentDeleteOpen(false)}
        title="Permanently Delete Substance"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 font-medium">
            Permanently delete <span className="font-bold text-slate-800">{selectedTrashed?.chemical_name}</span>?
            This cannot be undone.
          </p>
          <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg text-xs text-rose-700 font-semibold space-y-1">
            <p className="font-bold">CAUTION: PERMANENT DATA LOSS</p>
            <p>
              All client assignments, TCC applications, and certificates linked to this substance may be affected.
            </p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsPermanentDeleteOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handlePermanentDelete}
              isLoading={isPending}
              disabled={isPending}
              className="bg-rose-600 hover:bg-rose-700 text-white border-rose-600"
            >
              Delete Permanently
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
