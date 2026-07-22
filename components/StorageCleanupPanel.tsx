'use client';

import { useState, useTransition } from 'react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { toast } from '@/store/toast';
import {
  scanOrphanCertificateFilesAction,
  deleteOrphanCertificateFilesAction,
} from '@/actions/super-tools';

interface ScanResult {
  uploadRoot: string;
  scanned: number;
  orphans: string[];
  deleted: number;
  dryRun: boolean;
  errors: string[];
}

export default function StorageCleanupPanel() {
  const [folder, setFolder] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleScan = () => {
    startTransition(async () => {
      const data = await scanOrphanCertificateFilesAction(folder);
      if (!data.success) {
        toast.error(data.error || 'Scan failed.');
        return;
      }
      setResult({
        uploadRoot: data.uploadRoot || '',
        scanned: data.scanned || 0,
        orphans: data.orphans || [],
        deleted: data.deleted || 0,
        dryRun: data.dryRun ?? true,
        errors: data.errors || [],
      });
      toast.info(`Found ${(data.orphans || []).length} orphan file(s) out of ${data.scanned || 0} scanned.`);
    });
  };

  const handleDelete = () => {
    if (!result || result.orphans.length === 0) return;
    const confirmed = window.confirm(
      `Delete ${result.orphans.length} orphan file(s) from live disk? This cannot be undone. Database rows are never touched.`
    );
    if (!confirmed) return;

    startTransition(async () => {
      const data = await deleteOrphanCertificateFilesAction(folder);
      if (!data.success) {
        toast.error(data.error || 'Delete failed.');
        return;
      }
      setResult({
        uploadRoot: data.uploadRoot || '',
        scanned: data.scanned || 0,
        orphans: data.orphans || [],
        deleted: data.deleted || 0,
        dryRun: data.dryRun ?? false,
        errors: data.errors || [],
      });
      toast.success(data.message || `Deleted ${data.deleted} orphan file(s).`);
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs font-semibold text-amber-800">
        Scans the certificates upload folder for PDF/DOCX files that no certificate or PO row in the
        database points to, and lets you delete them. Database rows are never modified — only
        unreferenced files on disk. Super Admin only.
      </div>

      <Input
        label="Client folder (optional)"
        placeholder="e.g. Vibfast_Pigments — leave empty to scan every client"
        value={folder}
        onChange={(e) => setFolder(e.target.value)}
      />

      <div className="flex flex-wrap gap-3">
        <Button onClick={handleScan} isLoading={isPending} disabled={isPending}>
          Scan for Orphan Files
        </Button>
        <Button
          variant="destructive"
          onClick={handleDelete}
          isLoading={isPending}
          disabled={isPending || !result || result.orphans.length === 0}
        >
          Delete Found Orphans
        </Button>
      </div>

      {result && (
        <div className="border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="text-sm font-bold text-slate-700">
            Scanned {result.scanned} file(s) under <code className="text-xs">{result.uploadRoot}</code>
          </div>
          <div className="text-sm font-semibold text-slate-600">
            {result.orphans.length === 0
              ? 'No orphan files found.'
              : `${result.orphans.length} orphan file(s)${result.dryRun ? ' (not deleted yet)' : ' processed'}:`}
          </div>
          {result.orphans.length > 0 && (
            <ul className="max-h-64 overflow-y-auto text-xs font-mono text-slate-600 space-y-1 bg-slate-50 rounded-lg p-3">
              {result.orphans.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
          {result.errors.length > 0 && (
            <div className="text-xs font-semibold text-red-600">
              Errors: {result.errors.join('; ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
