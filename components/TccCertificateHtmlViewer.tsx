'use client';

import { useEffect } from 'react';
import TccCertificateHtmlDocument from '@/components/TccCertificateHtmlDocument';
import type { TccCertificateHtmlData } from '@/lib/tcc-certificate-html-data';
import '@/components/reach-certificate-fonts.css';
import '@/components/reach-certificate-a4.css';
import '@/components/tcc-certificate-html.css';

type TccCertificateHtmlViewerProps = {
  data: TccCertificateHtmlData;
};

function useTccCertificatePrintMode(): void {
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

export default function TccCertificateHtmlViewer({ data }: TccCertificateHtmlViewerProps) {
  useTccCertificatePrintMode();

  return (
    <div data-reach-cert-preview-shell>
      <div data-reach-cert-print-area>
        <TccCertificateHtmlDocument data={data} />
      </div>
    </div>
  );
}
