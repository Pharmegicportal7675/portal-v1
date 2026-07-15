'use client';

import { useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/Card';
import { Button } from './ui/Button';
import { toast } from '@/store/toast';
import { BookOpen, Upload, Trash2, Download, FileText } from 'lucide-react';

const USER_MANUAL_ENDPOINT = '/api/user-manual';

const ACCEPTED_FORMATS =
  '.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.txt,.zip,.rtf,.odt,.odp,.ods';

export type UserManualInfo = {
  fileName: string;
  contentType: string;
  size: number;
  uploadedAt: string;
};

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

export default function UserManualSettings({
  initialManual,
}: {
  initialManual: UserManualInfo | null;
}) {
  const [manual, setManual] = useState<UserManualInfo | null>(initialManual);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(USER_MANUAL_ENDPOINT, {
        method: 'POST',
        body: formData,
        credentials: 'same-origin',
      });
      const body = (await res.json().catch(() => null)) as
        | { success?: boolean; manual?: UserManualInfo; error?: string }
        | null;
      if (!res.ok || !body?.success || !body.manual) {
        throw new Error(body?.error || 'Upload failed.');
      }
      setManual(body.manual);
      toast.success('User manual uploaded.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (removing) return;
    if (!window.confirm('Remove the uploaded user manual? Users will no longer be able to download it.')) {
      return;
    }
    setRemoving(true);
    try {
      const res = await fetch(USER_MANUAL_ENDPOINT, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const body = (await res.json().catch(() => null)) as
        | { success?: boolean; error?: string }
        | null;
      if (!res.ok || !body?.success) {
        throw new Error(body?.error || 'Remove failed.');
      }
      setManual(null);
      toast.success('User manual removed.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Remove failed.');
    } finally {
      setRemoving(false);
    }
  };

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(USER_MANUAL_ENDPOINT, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || 'User manual is not available.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = manual?.fileName || 'user-manual';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Download failed.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card className="border-slate-100 shadow-xs">
      <CardHeader>
        <div className="flex items-center gap-2 text-primary">
          <BookOpen className="h-5 w-5" />
          <CardTitle>User Manual</CardTitle>
        </div>
        <CardDescription>
          Upload a manual (PDF, PPT, DOC, etc.) that every portal user can download from the sidebar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {manual ? (
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800 truncate" title={manual.fileName}>
                  {manual.fileName}
                </p>
                <p className="text-xs text-slate-500">
                  {formatBytes(manual.size)}
                  {formatDate(manual.uploadedAt) ? ` · Uploaded ${formatDate(manual.uploadedAt)}` : ''}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleDownload()}
                isLoading={downloading}
                disabled={downloading}
                className="gap-1.5"
              >
                <Download className="h-4 w-4" /> Download
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleRemove()}
                isLoading={removing}
                disabled={removing}
                className="gap-1.5 border-rose-200 text-rose-600 hover:bg-rose-50"
              >
                <Trash2 className="h-4 w-4" /> Remove
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
            <FileText className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm font-semibold text-slate-600">No user manual uploaded yet.</p>
            <p className="text-xs text-slate-400">Upload a file so users can download it.</p>
          </div>
        )}

        <div className="flex justify-end border-t border-slate-100 pt-4">
          <Button
            onClick={() => fileInputRef.current?.click()}
            isLoading={uploading}
            disabled={uploading}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            {manual ? 'Replace File' : 'Upload File'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_FORMATS}
            className="hidden"
            onChange={(event) => void handleUpload(event)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
