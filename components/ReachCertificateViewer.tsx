'use client';

import ReachCertificateDocxViewer from '@/components/ReachCertificateDocxViewer';
import ReachCertificateHtmlViewer from '@/components/ReachCertificateHtmlViewer';
import TccCertificateHtmlViewer from '@/components/TccCertificateHtmlViewer';
import type { ReachCertificateHtmlData } from '@/lib/reach-certificate-html-data';
import type { TccCertificateHtmlData } from '@/lib/tcc-certificate-html-data';

type ReachCertificateViewerProps = {
  certificateType?: 'rc' | 'tcc';
  docxUrl: string;
  htmlData?: ReachCertificateHtmlData | TccCertificateHtmlData | null;
};

/**
 * RC/TCC: styled HTML preview when htmlData is provided.
 * RC fallback: in-app DOCX preview.
 */
export default function ReachCertificateViewer({
  certificateType = 'tcc',
  docxUrl,
  htmlData,
}: ReachCertificateViewerProps) {
  if (certificateType === 'rc' && htmlData) {
    return (
      <ReachCertificateHtmlViewer
        key={JSON.stringify(htmlData)}
        data={htmlData as ReachCertificateHtmlData}
      />
    );
  }

  if (certificateType === 'tcc' && htmlData) {
    return (
      <TccCertificateHtmlViewer
        key={JSON.stringify(htmlData)}
        data={htmlData as TccCertificateHtmlData}
      />
    );
  }

  if (certificateType === 'tcc') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[320px] p-8 text-center text-slate-500">
        <p className="text-sm font-semibold">TCC certificate preview unavailable</p>
        <p className="text-xs mt-1 max-w-sm">Certificate data could not be loaded for HTML preview.</p>
      </div>
    );
  }

  return <ReachCertificateDocxViewer key={docxUrl} docxUrl={docxUrl} />;
}
