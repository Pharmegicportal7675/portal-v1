'use client';

import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { toast } from '@/store/toast';

const USER_MANUAL_ENDPOINT = '/api/user-manual';

function parseFileNameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  return match ? decodeURIComponent(match[1]) : null;
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export default function UserManualButton() {
  const [downloading, setDownloading] = useState(false);

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
      const fileName =
        parseFileNameFromDisposition(res.headers.get('Content-Disposition')) || 'user-manual';
      triggerBlobDownload(blob, fileName);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Download failed.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleDownload()}
      disabled={downloading}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/10 px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-white/20 disabled:opacity-60"
    >
      <BookOpen className="h-4 w-4 shrink-0" />
      {downloading ? 'Preparing…' : 'Download User Manual'}
    </button>
  );
}
