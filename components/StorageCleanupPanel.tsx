'use client';

import { useState } from 'react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { toast } from '@/store/toast';

interface ScanResult {
  uploadRoot: string;
  scanned: number;
  orphans: string[];
  deleted: number;
  dryRun: boolean;
  errors: string[];
}

async function callRepair(folder: string, apply: boolean): Promise<ScanResult> {
  const res = await fetch('/api/admin/repair-attachments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'orphans', folder: folder.trim() || undefined, apply }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Request failed');
  }
  return data as ScanResult;
}

export default function StorageCleanupPanel() {
  const [folder, setFolder] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleScan = async () => {
    setIsScanning(true);
    try {
      const data = await callRepair(folder, false);
      setResult(data);
      toast.info(`Found ${data.orphans.length} orphan file(s) out of ${data.scanned} scanned.`);
    } catch (err) {
      toast.error(err);
    } finally {
      setIsScanning(false);
    }
  };

  const handleDelete = async () => {
    if (!result || result.orphans.length === 0) return;
    const confirmed = window.confirm(
      `Delete ${result.orphans.length} orphan file(s) from live disk? This cannot be undone. Database rows are never touched.`
    );
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      const data = await callRepair(folder, true);
      setResult(data);
      toast.success(`Deleted ${data.deleted} orphan file(s).`);
    } catch (err) {
      toast.error(err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs font-semibold text-amber-800">
        Scans the live certificates upload folder for PDF/DOCX files that no certificate row in the
        database points to, and lets you delete them. Database rows are never modified — only
        unreferenced files on disk.
      </div>

      <Input
        label="Client folder (optional)"
        placeholder="e.g. Vibfast_Pigments — leave empty to scan every client"
        value={folder}
        onChange={(e) => setFolder(e.target.value)}
      />

      <div className="flex flex-wrap gap-3">
        <Button onClick={handleScan} isLoading={isScanning} disabled={isScanning || isDeleting}>
          Scan for Orphan Files
        </Button>
        <Button
          variant="destructive"
          onClick={handleDelete}
          isLoading={isDeleting}
          disabled={isDeleting || isScanning || !result || result.orphans.length === 0}
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
