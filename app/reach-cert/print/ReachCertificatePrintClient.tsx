'use client';

import { useEffect } from 'react';
import ReachCertificateHtmlDocument from '@/components/ReachCertificateHtmlDocument';
import type { ReachCertificateHtmlData } from '@/lib/reach-certificate-html-data';
import {
  REACH_CERT_A4_HEIGHT_PX,
  REACH_CERT_A4_WIDTH_PX,
} from '@/lib/reach-certificate-a4';
import '@/components/reach-certificate-fonts.css';
import '@/components/reach-certificate-a4.css';
import '@/components/reach-certificate-html.css';

type ReachCertificatePrintClientProps = {
  data: ReachCertificateHtmlData;
};

export default function ReachCertificatePrintClient({ data }: ReachCertificatePrintClientProps) {
  useEffect(() => {
    document.body.setAttribute('data-reach-pdf-ready', 'true');
    document.documentElement.style.width = `${REACH_CERT_A4_WIDTH_PX}px`;
    document.documentElement.style.height = `${REACH_CERT_A4_HEIGHT_PX}px`;
    document.body.style.width = `${REACH_CERT_A4_WIDTH_PX}px`;
    document.body.style.height = `${REACH_CERT_A4_HEIGHT_PX}px`;
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';
    document.body.style.background = '#ffffff';

    return () => {
      document.body.removeAttribute('data-reach-pdf-ready');
      document.documentElement.style.width = '';
      document.documentElement.style.height = '';
      document.body.style.width = '';
      document.body.style.height = '';
      document.body.style.margin = '';
      document.body.style.padding = '';
      document.body.style.overflow = '';
      document.body.style.background = '';
    };
  }, []);

  return (
    <div
      data-reach-cert-print-area
      style={{
        width: REACH_CERT_A4_WIDTH_PX,
        height: REACH_CERT_A4_HEIGHT_PX,
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        background: '#ffffff',
      }}
    >
      <ReachCertificateHtmlDocument data={data} />
    </div>
  );
}
