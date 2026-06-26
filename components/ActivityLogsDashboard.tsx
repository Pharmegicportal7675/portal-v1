'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { TableColumnFilter } from '@/components/ui/TableColumnFilter';
import { TableDateRangeFilter, type DateRangeValue } from '@/components/ui/TableDateRangeFilter';
import { ResponsiveTableScroll } from '@/components/ui/ResponsiveTableScroll';
import { formatDisplayDate, matchesDateRange } from '@/lib/date-filter';
import { formatActivityLogAction, formatActivityLogRole } from '@/lib/activity-log-labels';
import type { ActivityLogRecord } from '@/services/activity-logs';
import { History } from 'lucide-react';

interface ActivityLogsDashboardProps {
  initialLogs: ActivityLogRecord[];
}

const EMPTY_DATE_RANGE: DateRangeValue = { from: '', to: '' };

function matchesText(haystack: string, needle: string) {
  if (!needle.trim()) return true;
  return haystack.toLowerCase().includes(needle.trim().toLowerCase());
}

function resolveUserLabel(log: ActivityLogRecord): string {
  const email = log.users?.email?.trim();
  if (email) return email;
  if (log.user_id) return log.user_id;
  return 'System';
}

function resolveClientLabel(log: ActivityLogRecord): string {
  return log.clients?.company_name?.trim() || '—';
}

export default function ActivityLogsDashboard({ initialLogs }: ActivityLogsDashboardProps) {
  const [columnFilters, setColumnFilters] = useState({
    action: 'all',
    user: '',
    client: '',
    details: '',
    date: { ...EMPTY_DATE_RANGE },
  });

  const actionOptions = useMemo(() => {
    const actions = [...new Set(initialLogs.map((log) => log.action).filter(Boolean))].sort();
    return [
      { value: 'all', label: 'All actions' },
      ...actions.map((action) => ({
        value: action,
        label: formatActivityLogAction(action),
      })),
    ];
  }, [initialLogs]);

  const filteredLogs = useMemo(() => {
    return initialLogs.filter((log) => {
      const userLabel = resolveUserLabel(log);
      const roleLabel = formatActivityLogRole(log.users?.role);
      const clientLabel = resolveClientLabel(log);
      const details = [log.description, log.entity_type, log.entity_id].filter(Boolean).join(' ');

      if (columnFilters.action !== 'all' && columnFilters.action && log.action !== columnFilters.action) {
        return false;
      }
      if (!matchesText(`${userLabel} ${roleLabel}`, columnFilters.user)) return false;
      if (!matchesText(clientLabel, columnFilters.client)) return false;
      if (!matchesText(details, columnFilters.details)) return false;
      if (!matchesDateRange(log.created_at, columnFilters.date.from, columnFilters.date.to)) return false;
      return true;
    });
  }, [initialLogs, columnFilters]);

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
          <History className="h-6 w-6 text-primary" />
          Activity Log
        </h1>
        <p className="text-sm text-slate-500 font-medium mt-1">
          Full audit trail of actions across the portal — who did what and when.
        </p>
      </div>

      <Card className="border-slate-100 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/50 text-xs text-slate-500 font-medium">
          Showing {filteredLogs.length} of {initialLogs.length} recent events
        </div>
        <ResponsiveTableScroll>
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50/50 text-slate-500 font-bold text-[11px] uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 min-w-[140px]">
                  <span className="block mb-1.5">When</span>
                  <TableDateRangeFilter
                    value={columnFilters.date}
                    onChange={(date) => setColumnFilters((prev) => ({ ...prev, date }))}
                  />
                </th>
                <th className="px-4 py-3 min-w-[180px]">
                  <span className="block mb-1.5">Action</span>
                  <TableColumnFilter
                    type="select"
                    value={columnFilters.action}
                    onChange={(action) => setColumnFilters((prev) => ({ ...prev, action }))}
                    placeholder="All actions"
                    options={actionOptions}
                  />
                </th>
                <th className="px-4 py-3 min-w-[180px]">
                  <span className="block mb-1.5">Who</span>
                  <TableColumnFilter
                    value={columnFilters.user}
                    onChange={(user) => setColumnFilters((prev) => ({ ...prev, user }))}
                    placeholder="Filter user..."
                  />
                </th>
                <th className="px-4 py-3 min-w-[160px]">
                  <span className="block mb-1.5">Client</span>
                  <TableColumnFilter
                    value={columnFilters.client}
                    onChange={(client) => setColumnFilters((prev) => ({ ...prev, client }))}
                    placeholder="Filter client..."
                  />
                </th>
                <th className="px-4 py-3 min-w-[240px]">
                  <span className="block mb-1.5">Details</span>
                  <TableColumnFilter
                    value={columnFilters.details}
                    onChange={(details) => setColumnFilters((prev) => ({ ...prev, details }))}
                    placeholder="Filter details..."
                  />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400 font-medium">
                    No activity matches your filters.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap" suppressHydrationWarning>
                      {formatDisplayDate(log.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800 text-xs">
                        {formatActivityLogAction(log.action)}
                      </p>
                      {log.entity_type && (
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">{log.entity_type}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-700 text-xs">{resolveUserLabel(log)}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {formatActivityLogRole(log.users?.role)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {log.client_id ? (
                        <Link
                          href={`/admin/clients/${log.client_id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {resolveClientLabel(log)}
                        </Link>
                      ) : (
                        resolveClientLabel(log)
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {log.description?.trim() || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ResponsiveTableScroll>
      </Card>
    </div>
  );
}
