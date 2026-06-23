'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import {
  downloadClientImportTemplateAction,
  importClientsDirectoryAction,
} from '@/actions/clients-import';
import { downloadExcelFromBase64 } from '@/lib/export-excel';
import { toast } from '@/store/toast';
import { FileSpreadsheet, Upload } from 'lucide-react';

type ImportSummary = Awaited<ReturnType<typeof importClientsDirectoryAction>> & {
  success: true;
};

export function ClientDirectoryImport() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingMode, setPendingMode] = useState<'import' | 'template' | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);

  const resetState = () => {
    setSelectedFile(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const closeDialog = () => {
    setIsOpen(false);
    resetState();
  };

  const readFileAsBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const value = reader.result;
        if (typeof value !== 'string') {
          reject(new Error('Failed to read file.'));
          return;
        }
        const base64 = value.split(',')[1];
        if (!base64) {
          reject(new Error('Failed to read file.'));
          return;
        }
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsDataURL(file);
    });

  const handleDownloadTemplate = () => {
    setPendingMode('template');
    startTransition(async () => {
      const response = await downloadClientImportTemplateAction();
      setPendingMode(null);
      if (!response.success) {
        toast.error(response.error);
        return;
      }
      downloadExcelFromBase64(response.filename, response.base64);
      toast.success('Import template downloaded.');
    });
  };

  const runImport = () => {
    if (!selectedFile) {
      toast.error('Select a CSV or Excel file first.');
      return;
    }

    setPendingMode('import');
    startTransition(async () => {
      try {
        const base64 = await readFileAsBase64(selectedFile);
        const response = await importClientsDirectoryAction({
          base64,
          filename: selectedFile.name,
        });
        setPendingMode(null);

        if (!response.success) {
          toast.error(response.error);
          return;
        }

        setResult(response);

        const { summary } = response;
        const parts = [
          summary.createdClients > 0 ? `${summary.createdClients} client(s) added` : null,
          summary.updatedClients > 0 ? `${summary.updatedClients} client(s) updated` : null,
          summary.skippedClients > 0 ? `${summary.skippedClients} client(s) skipped` : null,
          summary.failedClients > 0 ? `${summary.failedClients} client(s) failed` : null,
          summary.createdContacts > 0 ? `${summary.createdContacts} contact(s) added` : null,
          summary.updatedContacts > 0 ? `${summary.updatedContacts} contact(s) updated` : null,
          summary.skippedContacts > 0 ? `${summary.skippedContacts} contact(s) skipped` : null,
          summary.createdSubstances > 0 ? `${summary.createdSubstances} substance(s) added` : null,
          summary.updatedSubstances > 0 ? `${summary.updatedSubstances} substance(s) updated` : null,
          summary.skippedSubstances > 0 ? `${summary.skippedSubstances} substance(s) skipped` : null,
          summary.failedSubstances > 0 ? `${summary.failedSubstances} substance(s) failed` : null,
        ].filter(Boolean);

        toast.success(parts.join(', ') || 'Import completed.');
        router.refresh();
      } catch (error) {
        setPendingMode(null);
        toast.error(error instanceof Error ? error.message : 'Import failed.');
      }
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8"
        onClick={() => {
          resetState();
          setIsOpen(true);
        }}
      >
        <Upload className="h-3.5 w-3.5 mr-1.5" />
        Import
      </Button>

      <Dialog isOpen={isOpen} onClose={closeDialog} title="Import Clients & Substances">
        <div className="space-y-5">
          <p className="text-sm text-slate-600">
            Upload a CSV or Excel file to import clients and substances. Use the Pharmegic export
            format (Client / Authorized Substance rows) or the sample template below.
          </p>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 space-y-2">
            <p className="font-semibold text-slate-700">Client rows</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Company Name</li>
              <li>Email (or Login Email)</li>
              <li>EU REACH / UK REACH / TURKEY REACH (KKDIK) — True or False</li>
            </ul>
            <p className="font-semibold text-slate-700 pt-2">Secondary contact rows (Record Type: Contact)</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Company Name</li>
              <li>First Name, Last Name, Email</li>
              <li>Optional: Phone, Position / Role</li>
            </ul>
            <p className="font-semibold text-slate-700 pt-2">Substance rows (Record Type: Authorized Substance)</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Company Name (must match an existing or new client)</li>
              <li>Substance Name</li>
              <li>CAS Number</li>
            </ul>
            <p className="text-xs text-slate-500">
              Optional substance fields: EC Number, Tonnage Band, Registration Number, Issued Date,
              Validity Date. Defaults: TEST-REG, 2026-01-01, 2026-12-31, quantity 0.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleDownloadTemplate} disabled={isPending} isLoading={isPending && pendingMode === 'template'}>
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
              Download Template
            </Button>
          </div>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-teal-700 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-teal-800"
              onChange={(event) => {
                setResult(null);
                setSelectedFile(event.target.files?.[0] ?? null);
              }}
            />
            {selectedFile && (
              <p className="mt-2 text-xs text-slate-500">Selected: {selectedFile.name}</p>
            )}
          </div>

          {result?.success && (
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm space-y-4 max-h-80 overflow-y-auto">
              <p className="font-semibold text-slate-800">Import Summary</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <span className="text-emerald-700">Clients added: {result.summary.createdClients}</span>
                <span className="text-teal-700">Clients updated: {result.summary.updatedClients}</span>
                <span className="text-amber-700">Clients skipped: {result.summary.skippedClients}</span>
                <span className="text-rose-700">Clients failed: {result.summary.failedClients}</span>
                <span className="text-emerald-700">Contacts added: {result.summary.createdContacts}</span>
                <span className="text-teal-700">Contacts updated: {result.summary.updatedContacts}</span>
                <span className="text-amber-700">Contacts skipped: {result.summary.skippedContacts}</span>
                <span className="text-emerald-700">Substances added: {result.summary.createdSubstances}</span>
                <span className="text-teal-700">Substances updated: {result.summary.updatedSubstances}</span>
                <span className="text-amber-700">Substances skipped: {result.summary.skippedSubstances}</span>
                <span className="text-rose-700">Substances failed: {result.summary.failedSubstances}</span>
              </div>

              {result.summary.clients.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Clients</p>
                  {result.summary.clients.map((row) => (
                    <div key={`${row.email}-${row.company_name}`} className="text-xs border-t border-slate-100 pt-2">
                      <span className="font-medium text-slate-800">{row.company_name}</span>
                      <span
                        className={
                          row.status === 'created'
                            ? ' text-emerald-700'
                            : row.status === 'updated'
                              ? ' text-teal-700'
                              : row.status === 'skipped'
                                ? ' text-amber-700'
                                : ' text-rose-700'
                        }
                      >
                        {' '}
                        — {row.status}: {row.reason}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {result.summary.contacts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Contacts</p>
                  {result.summary.contacts.map((row) => (
                    <div key={`${row.email}-${row.company_name}`} className="text-xs border-t border-slate-100 pt-2">
                      <span className="font-medium text-slate-800">
                        {row.company_name} — {row.email}
                      </span>
                      <span
                        className={
                          row.status === 'created'
                            ? ' text-emerald-700'
                            : row.status === 'updated'
                              ? ' text-teal-700'
                              : row.status === 'skipped'
                                ? ' text-amber-700'
                                : ' text-rose-700'
                        }
                      >
                        {' '}
                        — {row.status}: {row.reason}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {result.summary.substances.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Substances</p>
                  {result.summary.substances.map((row) => (
                    <div
                      key={`${row.company_name}-${row.cas_number}`}
                      className="text-xs border-t border-slate-100 pt-2"
                    >
                      <span className="font-medium text-slate-800">
                        {row.company_name} — {row.chemical_name} ({row.cas_number})
                      </span>
                      <span
                        className={
                          row.status === 'created'
                            ? ' text-emerald-700'
                            : row.status === 'updated'
                              ? ' text-teal-700'
                              : row.status === 'skipped'
                                ? ' text-amber-700'
                                : ' text-rose-700'
                        }
                      >
                        {' '}
                        — {row.status}: {row.reason}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {result.skippedRows.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Ignored Rows</p>
                  {result.skippedRows.map((row) => (
                    <div key={`skipped-${row.rowNumber}`} className="text-xs text-amber-700">
                      Row {row.rowNumber}: {row.reason}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={closeDialog} disabled={isPending}>
              Close
            </Button>
            <Button
              type="button"
              onClick={runImport}
              disabled={isPending || !selectedFile}
              isLoading={isPending && pendingMode === 'import'}
            >
              Import
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
