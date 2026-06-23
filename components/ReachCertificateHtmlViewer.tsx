'use client';

import { useEffect } from 'react';
import ReachCertificateHtmlDocument from '@/components/ReachCertificateHtmlDocument';
import type { ReachCertificateHtmlData } from '@/lib/reach-certificate-html-data';
import '@/components/reach-certificate-fonts.css';
import '@/components/reach-certificate-a4.css';
import '@/components/reach-certificate-html.css';

type ReachCertificateHtmlViewerProps = {
  data: ReachCertificateHtmlData;
};

function useReachCertificatePrintMode(): void {
  useEffect(() => {
    const onBeforePrint = () => document.body.classList.add('reach-cert-printing');
    const onAfterPrint = () => document.body.classList.remove('reach-cert-printing');

    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);

    return () => {
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', onAfterPrint);
      document.body.classList.remove('reach-cert-printing');
    };
  }, []);
}

export default function ReachCertificateHtmlViewer({ data }: ReachCertificateHtmlViewerProps) {
  useReachCertificatePrintMode();

  return (
    <div data-reach-cert-preview-shell>
      <div data-reach-cert-print-area>
        <ReachCertificateHtmlDocument data={data} />
      </div>
    </div>
  );
}
