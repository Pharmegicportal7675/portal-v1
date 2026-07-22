'use client';

import { useMemo, useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  listMissingPoApplicationsAction,
  listCertificateFileStatusAction,
  uploadMissingPoAction,
  regenerateMissingCertificatesAction,
  forceRegenerateCertificateAction,
  ensureCertificateFoldersAction,
  scanOrphanCertificateFilesAction,
  deleteOrphanCertificateFilesAction,
  type MissingPoRow,
  type CertificateFileStatusRow,
} from '@/actions/super-tools';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { ResponsiveTableScroll } from '@/components/ui/ResponsiveTableScroll';
import { toast } from '@/store/toast';
import {
  AlertTriangle,
  FileUp,
  FolderTree,
  HardDrive,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';

interface SuperAdminOnlyForYouPanelProps {
  initialMissingPos: MissingPoRow[];
  initialCertificates: CertificateFileStatusRow[];
}

type CertFilter = 'all' | 'missing' | 'TCC' | 'REACH';

export default function SuperAdminOnlyForYouPanel({
  initialMissingPos,
  initialCertificates,
}: SuperAdminOnlyForYouPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isBootLoading, setIsBootLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [missingPos, setMissingPos] = useState(initialMissingPos);
  const [certificates, setCertificates] = useState(initialCertificates);
  const [poFiles, setPoFiles] = useState<Record<string, File | null>>({});
  const [certFilter, setCertFilter] = useState<CertFilter>('missing');
  const [orphanFolder, setOrphanFolder] = useState('');
  const [orphans, setOrphans] = useState<string[] | null>(null);
  const [orphanMeta, setOrphanMeta] = useState<{
    scanned: number;
    uploadRoot: string;
  } | null>(null);

  const loadLists = async (opts?: { silent?: boolean }) => {
    setLoadError(null);
    try {
      // Sequential to reduce MySQL pool pressure (remote Hostinger limit is small).
      const poRes = await listMissingPoApplicationsAction();
      if (!poRes.success) {
        throw new Error(poRes.error || 'Failed to load missing POs.');
      }
      setMissingPos(poRes.rows || []);

      const certRes = await listCertificateFileStatusAction();
      if (!certRes.success) {
        throw new Error(certRes.error || 'Failed to load certificate status.');
      }
      setCertificates(certRes.rows || []);
      if (!opts?.silent) router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load Only For You data.';
      setLoadError(message);
      if (!opts?.silent) toast.error(message);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsBootLoading(true);
      await loadLists({ silent: true });
      if (!cancelled) setIsBootLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // Boot load once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const missingCertCount = useMemo(
    () => certificates.filter((c) => !c.onDisk).length,
    [certificates]
  );

  const filteredCerts = useMemo(() => {
    return certificates.filter((c) => {
      if (certFilter === 'missing') return !c.onDisk;
      if (certFilter === 'TCC') return c.type === 'TCC';
      if (certFilter === 'REACH') return c.type === 'REACH';
      return true;
    });
  }, [certificates, certFilter]);

  const refreshLists = () => {
    startTransition(async () => {
      await loadLists();
    });
  };

  const handlePoUpload = (applicationId: string) => {
    const file = poFiles[applicationId];
    if (!file) {
      toast.error('Choose a PO file first.');
      return;
    }
    startTransition(async () => {
      const formData = new FormData();
      formData.set('bo_attachment', file);
      const res = await uploadMissingPoAction(applicationId, formData);
      if (!res.success) {
        toast.error(res.error || 'PO upload failed.');
        return;
      }
      toast.success(res.message || 'PO uploaded.');
      setPoFiles((prev) => ({ ...prev, [applicationId]: null }));
      const poRes = await listMissingPoApplicationsAction();
      if (poRes.success && poRes.rows) setMissingPos(poRes.rows);
      router.refresh();
    });
  };

  const handleRegenMissing = (types?: Array<'TCC' | 'REACH'>) => {
    startTransition(async () => {
      const res = await regenerateMissingCertificatesAction({ types });
      if (!res.success) {
        toast.error(res.error || 'Regeneration failed.');
        return;
      }
      toast.success(res.message || 'Regeneration complete.');
      const errLines = [
        ...(res.tcc?.errors || []),
        ...(res.reach?.errors || []),
      ];
      if (errLines.length) {
        toast.error(errLines.slice(0, 3).join(' | '));
      }
      const certRes = await listCertificateFileStatusAction();
      if (certRes.success && certRes.rows) setCertificates(certRes.rows);
      router.refresh();
    });
  };

  const handleForceRegen = (certificateId: string) => {
    startTransition(async () => {
      const res = await forceRegenerateCertificateAction(certificateId);
      if (!res.success) {
        toast.error(res.error || 'Force regenerate failed.');
        return;
      }
      toast.success(res.message || 'Certificate regenerated.');
      const certRes = await listCertificateFileStatusAction();
      if (certRes.success && certRes.rows) setCertificates(certRes.rows);
      router.refresh();
    });
  };

  const handleEnsureFolders = () => {
    startTransition(async () => {
      const res = await ensureCertificateFoldersAction();
      if (!res.success) {
        toast.error(res.error || 'Failed to ensure folders.');
        return;
      }
      toast.success(res.message || 'Folders ensured.');
    });
  };

  const handleScanOrphans = () => {
    startTransition(async () => {
      const res = await scanOrphanCertificateFilesAction(orphanFolder);
      if (!res.success) {
        toast.error(res.error || 'Orphan scan failed.');
        return;
      }
      setOrphans(res.orphans || []);
      setOrphanMeta({
        scanned: res.scanned || 0,
        uploadRoot: res.uploadRoot || '',
      });
      toast.info(`Found ${(res.orphans || []).length} orphan file(s).`);
    });
  };

  const handleDeleteOrphans = () => {
    if (!orphans || orphans.length === 0) return;
    const confirmed = window.confirm(
      `Delete ${orphans.length} orphan file(s) from disk? Database rows are never changed.`
    );
    if (!confirmed) return;

    startTransition(async () => {
      const res = await deleteOrphanCertificateFilesAction(orphanFolder);
      if (!res.success) {
        toast.error(res.error || 'Delete failed.');
        return;
      }
      toast.success(res.message || 'Orphans deleted.');
      setOrphans(res.orphans || []);
      setOrphanMeta({
        scanned: res.scanned || 0,
        uploadRoot: res.uploadRoot || '',
      });
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-violet-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-violet-900">Only For You — Super Admin exclusive</p>
          <p className="text-xs text-violet-800 font-medium mt-0.5">
            Master Admins and clients cannot see this panel. Uploads save into the live
            Client/Year/PO|RC|TCC folder layout and appear for everyone once stored.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={refreshLists}
          disabled={isPending || isBootLoading}
          className="gap-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh lists
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleEnsureFolders}
          disabled={isPending}
          className="gap-1.5"
        >
          <FolderTree className="h-3.5 w-3.5" /> Ensure folders
        </Button>
      </div>

      {isBootLoading && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm font-medium text-slate-600">
          Loading missing POs and certificate file status…
        </div>
      )}

      {loadError && !isBootLoading && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 flex flex-wrap items-center justify-between gap-3">
          <span>{loadError}</span>
          <Button size="sm" variant="outline" onClick={refreshLists} disabled={isPending}>
            Retry
          </Button>
        </div>
      )}

      <Card className="border-slate-100 shadow-xs">
        <CardHeader>
          <div className="flex items-center gap-2 text-primary">
            <FileUp className="h-5 w-5" />
            <CardTitle>Missing PO attachments</CardTitle>
          </div>
          <CardDescription>
            {missingPos.length} application{missingPos.length !== 1 ? 's' : ''} with a DB path but no
            file on this server. Upload saves into the correct Client/Year/PO folder.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ResponsiveTableScroll>
            <table className="w-full text-left border-collapse min-w-[900px] text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="p-3 text-xs font-bold text-slate-500 uppercase">Client</th>
                  <th className="p-3 text-xs font-bold text-slate-500 uppercase">Expected path</th>
                  <th className="p-3 text-xs font-bold text-slate-500 uppercase">Stored name</th>
                  <th className="p-3 text-xs font-bold text-slate-500 uppercase">Upload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {missingPos.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-400 font-medium">
                      {isBootLoading ? 'Loading…' : 'No missing PO files on this server.'}
                    </td>
                  </tr>
                ) : (
                  missingPos.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/50">
                      <td className="p-3">
                        <div className="font-semibold text-slate-800">{row.companyName}</div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          {row.trackingId || row.id}
                        </div>
                      </td>
                      <td className="p-3 font-mono text-[11px] text-slate-600 break-all max-w-xs">
                        {row.expectedPath || '—'}
                      </td>
                      <td className="p-3 text-slate-600">{row.attachmentName || '—'}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="file"
                            className="text-xs max-w-[180px]"
                            onChange={(e) =>
                              setPoFiles((prev) => ({
                                ...prev,
                                [row.id]: e.target.files?.[0] || null,
                              }))
                            }
                          />
                          <Button
                            size="sm"
                            className="h-8"
                            disabled={isPending || !poFiles[row.id]}
                            onClick={() => handlePoUpload(row.id)}
                          >
                            Upload
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </ResponsiveTableScroll>
        </CardContent>
      </Card>

      <Card className="border-slate-100 shadow-xs">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-primary">
                <RefreshCw className="h-5 w-5" />
                <CardTitle>TCC &amp; RC certificate files</CardTitle>
              </div>
              <CardDescription className="mt-1">
                {missingCertCount} missing on disk · {certificates.length} total active
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => handleRegenMissing(['TCC', 'REACH'])}
                disabled={isPending || missingCertCount === 0}
                className="gap-1.5"
              >
                Regenerate all missing
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleRegenMissing(['TCC'])}
                disabled={isPending}
              >
                Missing TCC
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleRegenMissing(['REACH'])}
                disabled={isPending}
              >
                Missing RC
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            {(['missing', 'all', 'TCC', 'REACH'] as CertFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setCertFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  certFilter === f
                    ? 'bg-primary text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f === 'REACH' ? 'RC' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ResponsiveTableScroll>
            <table className="w-full text-left border-collapse min-w-[880px] text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="p-3 text-xs font-bold text-slate-500 uppercase">Certificate</th>
                  <th className="p-3 text-xs font-bold text-slate-500 uppercase">Client</th>
                  <th className="p-3 text-xs font-bold text-slate-500 uppercase">Type</th>
                  <th className="p-3 text-xs font-bold text-slate-500 uppercase">Disk</th>
                  <th className="p-3 text-xs font-bold text-slate-500 uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCerts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400 font-medium">
                      {isBootLoading ? 'Loading…' : 'No certificates in this filter.'}
                    </td>
                  </tr>
                ) : (
                  filteredCerts.slice(0, 100).map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/50">
                      <td className="p-3">
                        <div className="font-semibold text-slate-800 font-mono text-xs">
                          {row.certificateNumber}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5 break-all max-w-xs">
                          {row.relativePath || '—'}
                        </div>
                      </td>
                      <td className="p-3 font-medium text-slate-700">{row.companyName}</td>
                      <td className="p-3">
                        <Badge variant={row.type === 'TCC' ? 'warning' : 'primary'}>
                          {row.type === 'REACH' ? 'RC' : 'TCC'}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <Badge variant={row.onDisk ? 'success' : 'danger'}>
                          {row.onDisk ? 'On disk' : 'Missing'}
                        </Badge>
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          disabled={isPending}
                          onClick={() => handleForceRegen(row.id)}
                        >
                          Force regenerate
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </ResponsiveTableScroll>
          {filteredCerts.length > 100 && (
            <p className="p-3 text-xs text-slate-500 font-medium border-t border-slate-100">
              Showing first 100 of {filteredCerts.length}. Use filters or regenerate-all for bulk.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-100 shadow-xs">
        <CardHeader>
          <div className="flex items-center gap-2 text-primary">
            <HardDrive className="h-5 w-5" />
            <CardTitle>Orphan storage cleanup</CardTitle>
          </div>
          <CardDescription>
            Keep only TCC, RC, and PO files referenced by client records. Delete unreferenced PDF/DOCX
            on disk. Database rows are never deleted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs font-semibold text-amber-800">
              Scan first, then delete. Only files that no certificate or PO row points to are removed.
            </p>
          </div>
          <Input
            label="Client folder (optional)"
            placeholder="e.g. Nepa_Overseas — leave empty to scan all"
            value={orphanFolder}
            onChange={(e) => setOrphanFolder(e.target.value)}
          />
          <div className="flex flex-wrap gap-3">
            <Button onClick={handleScanOrphans} isLoading={isPending} disabled={isPending}>
              Scan for orphans
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteOrphans}
              isLoading={isPending}
              disabled={isPending || !orphans || orphans.length === 0}
              className="gap-1.5"
            >
              <Trash2 className="h-4 w-4" /> Delete found orphans
            </Button>
          </div>
          {orphans && orphanMeta && (
            <div className="border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="text-sm font-bold text-slate-700">
                Scanned {orphanMeta.scanned} file(s) under{' '}
                <code className="text-xs">{orphanMeta.uploadRoot}</code>
              </div>
              <div className="text-sm font-semibold text-slate-600">
                {orphans.length === 0
                  ? 'No orphan files found.'
                  : `${orphans.length} orphan file(s):`}
              </div>
              {orphans.length > 0 && (
                <ul className="max-h-64 overflow-y-auto text-xs font-mono text-slate-600 space-y-1 bg-slate-50 rounded-lg p-3">
                  {orphans.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
