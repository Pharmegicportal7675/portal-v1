'use client';

import { useEffect, useState } from 'react';
import TccCertificateHtmlViewer from '@/components/TccCertificateHtmlViewer';
import type { TccCertificateHtmlData } from '@/lib/tcc-certificate-html-data';
import {
  buildTccCertificateApplicationHtmlDataUrl,
  buildTccCertificateHtmlDataUrl,
} from '@/lib/tcc-certificate-download';

type TccCertificateHtmlPreviewFromApiProps = {
  certificateId?: string;
  applicationId?: string;
};

export default function TccCertificateHtmlPreviewFromApi({
  certificateId,
  applicationId,
}: TccCertificateHtmlPreviewFromApiProps) {
  const [data, setData] = useState<TccCertificateHtmlData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const url = certificateId
      ? buildTccCertificateHtmlDataUrl(certificateId)
      : applicationId
        ? buildTccCertificateApplicationHtmlDataUrl(applicationId)
        : null;

    if (!url) {
      setLoading(false);
      setError('Certificate preview is unavailable.');
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(url, { cache: 'no-store' });
        const body = (await res.json()) as TccCertificateHtmlData | { error?: string };
        if (!res.ok) {
          throw new Error('error' in body ? body.error : 'Failed to load certificate preview.');
        }
        if (!cancelled) setData(body as TccCertificateHtmlData);
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
  }, [certificateId, applicationId]);

  if (loading) {
    return (
      <div className="flex min-h-[820px] items-center justify-center bg-slate-100 text-sm font-medium text-slate-500">
        Loading certificate preview…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-[320px] items-center justify-center p-8 text-center text-sm text-red-600 font-medium">
        {error || 'Certificate preview failed.'}
      </div>
    );
  }

  return <TccCertificateHtmlViewer data={data} />;
}
