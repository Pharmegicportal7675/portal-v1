'use client';

import { useState, useTransition } from 'react';
import { adminUpdateTccApplicationAction } from '@/actions/tcc';
import { Input } from './ui/Input';
import { DatePicker } from './ui/DatePicker';
import { Button } from './ui/Button';
import { FormLabel } from './ui/FormLabel';
import { ModalErrorBox } from './ui/ModalErrorBox';
import { toast } from '@/store/toast';
import type { TccViewApplication } from './TccApplicationViewDialog';

export type TccAdminEditValues = {
  applicationId: string;
  certificateId: string;
  eu_importer_company_name: string;
  eu_importer_address: string;
  purchase_order_number: string;
  invoice_number: string;
  quantity_mt: string;
  issue_date: string;
  export_date: string;
  registration_number: string;
  remarks: string;
};

function resolveCertificateIssuedAt(app: TccViewApplication): string {
  const fromCert = (() => {
    const cert = app.certificates;
    if (!cert) return '';
    const row = Array.isArray(cert) ? cert[0] : cert;
    return formatDateInput(row?.issued_at);
  })();
  if (fromCert) return fromCert;
  return formatDateInput(app.certificate_issue_date);
}

function formatDateInput(value: string | null | undefined) {
  if (!value) return '';
  return value.slice(0, 10);
}

export function buildTccAdminEditValues(app: TccViewApplication): TccAdminEditValues {
  const cert = app.certificates;
  const certRow = cert ? (Array.isArray(cert) ? cert[0] : cert) : null;

  return {
    applicationId: app.id,
    certificateId: certRow?.id ?? '',
    eu_importer_company_name: app.eu_importer_company_name?.trim() ?? '',
    eu_importer_address: app.eu_importer_address?.trim() ?? '',
    purchase_order_number: app.purchase_order_number?.trim() ?? '',
    invoice_number: app.invoice_number?.trim() ?? '',
    quantity_mt: String(app.quantity_mt ?? ''),
    issue_date: resolveCertificateIssuedAt(app),
    export_date: formatDateInput(app.export_date),
    registration_number: app.registration_number?.trim() ?? '',
    remarks: app.remarks?.trim() ?? '',
  };
}

function flattenActionError(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const fieldErrors = error as Record<string, string[] | undefined>;
    const first = Object.values(fieldErrors).flat().find(Boolean);
    if (first) return first;
  }
  return 'Failed to save changes.';
}

export type TccAdminEditSavedUpdates = Partial<TccViewApplication> & {
  certificateIssuedAt?: string;
};

interface TccApplicationAdminEditFormProps {
  values: TccAdminEditValues;
  onCancel: () => void;
  onSaved: (updates: TccAdminEditSavedUpdates) => void;
}

export function TccApplicationAdminEditForm({
  values,
  onCancel,
  onSaved,
}: TccApplicationAdminEditFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(values);

  const updateField = (field: keyof Omit<TccAdminEditValues, 'applicationId'>, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const payload = new FormData();
      payload.append('application_id', form.applicationId);
      payload.append('eu_importer_company_name', form.eu_importer_company_name.trim());
      payload.append('eu_importer_address', form.eu_importer_address.trim());
      payload.append('purchase_order_number', form.purchase_order_number.trim());
      payload.append('quantity_mt', form.quantity_mt);
      payload.append('export_date', form.export_date);
      if (form.certificateId) {
        payload.append('certificate_id', form.certificateId);
      }
      if (form.issue_date) {
        payload.append('issue_date', form.issue_date);
      }
      payload.append('registration_number', form.registration_number.trim());
      payload.append('remarks', form.remarks.trim());

      const res = await adminUpdateTccApplicationAction(null, payload);
      if (!res.success) {
        setError(flattenActionError(res.error));
        return;
      }

      toast.success(res.message || 'Application updated.');

      const issueDateIso = form.issue_date
        ? new Date(`${form.issue_date}T12:00:00`).toISOString()
        : null;

      onSaved({
        eu_importer_company_name: form.eu_importer_company_name.trim(),
        eu_importer_address: form.eu_importer_address.trim(),
        purchase_order_number: form.purchase_order_number.trim(),
        quantity_mt: Number(form.quantity_mt),
        export_date: form.export_date,
        registration_number: form.registration_number.trim(),
        remarks: form.remarks.trim() || null,
        updated_at: new Date().toISOString(),
        certificate_issue_date: form.issue_date || null,
        ...(issueDateIso ? { certificateIssuedAt: issueDateIso } : {}),
      });
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-4">
        <p className="text-xs font-semibold text-amber-900">
          Edit application data. Saved changes update the database and regenerate the certificate PDF preview.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2 sm:col-span-2">
            <FormLabel required>EU importer company name</FormLabel>
            <Input
              value={form.eu_importer_company_name}
              onChange={(e) => updateField('eu_importer_company_name', e.target.value)}
              required
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <FormLabel required>EU importer address</FormLabel>
            <Input
              value={form.eu_importer_address}
              onChange={(e) => updateField('eu_importer_address', e.target.value)}
              required
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <FormLabel required>Purchase order number</FormLabel>
            <Input
              value={form.purchase_order_number}
              onChange={(e) => updateField('purchase_order_number', e.target.value)}
              required
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Dates</p>
          </div>
          <div className="space-y-2">
            <FormLabel>Issue date</FormLabel>
            <DatePicker
              value={form.issue_date}
              onChange={(value) => updateField('issue_date', value)}
            />
            <p className="text-[10px] text-slate-500 font-medium">
              {form.certificateId
                ? 'Updates the issued date on the generated certificate.'
                : 'Saved on the application and used as the certificate issue date when you approve.'}
            </p>
          </div>
          <div className="space-y-2">
            <FormLabel required>Expected export date</FormLabel>
            <DatePicker
              value={form.export_date}
              onChange={(value) => updateField('export_date', value)}
              required
            />
          </div>
          <div className="space-y-2">
            <FormLabel required>Quantity (MT)</FormLabel>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={form.quantity_mt}
              onChange={(e) => updateField('quantity_mt', e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <FormLabel>Registration number</FormLabel>
            <Input
              value={form.registration_number}
              onChange={(e) => updateField('registration_number', e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <FormLabel>Remarks</FormLabel>
            <textarea
              className="w-full min-h-[72px] rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={form.remarks}
              onChange={(e) => updateField('remarks', e.target.value)}
            />
          </div>
        </div>
      </div>

      <ModalErrorBox message={error} />

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" isLoading={isPending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
