'use client';

import { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';
import { applyReachDocxPreviewStyles } from '@/lib/reach-docx-preview-styles';
import '@/components/reach-certificate-fonts.css';
import '@/components/reach-certificate-a4.css';

type ReachCertificateDocxViewerProps = {
  docxUrl: string;
};

export default function ReachCertificateDocxViewer({ docxUrl }: ReachCertificateDocxViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      container.innerHTML = '';

      try {
        const res = await fetch(docxUrl, { cache: 'no-store' });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error || 'Failed to load certificate preview.');
        }

        const blob = await res.blob();
        await renderAsync(blob, container, undefined, {
          className: 'docx-preview',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
          ignoreLastRenderedPageBreak: true,
        });

        applyReachDocxPreviewStyles(container);
        requestAnimationFrame(() => applyReachDocxPreviewStyles(container));
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Certificate preview failed.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [docxUrl]);

  return (
    <div data-reach-cert-preview-shell className="relative">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-50 text-sm font-medium text-slate-500">
          Loading certificate preview…
        </div>
      )}
      {error && (
        <div className="p-8 text-center text-sm text-red-600 font-medium">{error}</div>
      )}
      <div
        ref={containerRef}
        className="docx-preview-container flex justify-center [&_.docx-preview-wrapper]:bg-transparent"
      />
    </div>
  );
}
