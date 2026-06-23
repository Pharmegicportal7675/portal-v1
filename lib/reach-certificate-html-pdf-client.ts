'use client';



import {

  REACH_CERT_A4_HEIGHT_PX,

  REACH_CERT_A4_WIDTH_PX,

  applyReachCertificateA4Size,

} from '@/lib/reach-certificate-a4';

import type { ReachCertificateHtmlData } from '@/lib/reach-certificate-html-data';



function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}



function waitForLayout(): Promise<void> {

  return new Promise((resolve) => {

    window.requestAnimationFrame(() => {

      window.requestAnimationFrame(() => {

        window.setTimeout(resolve, 400);

      });

    });

  });

}



async function waitForImages(container: HTMLElement): Promise<void> {

  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  const imgs = Array.from(container.querySelectorAll('img'));

  await Promise.all(

    imgs.map(

      (img) =>

        new Promise<void>((resolve) => {

          if (img.complete) {

            resolve();

            return;

          }

          img.onload = () => resolve();

          img.onerror = () => resolve();

        })

    )

  );

  await waitForLayout();

}



async function captureElementToPdf(element: HTMLElement, fileName: string): Promise<void> {

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([

    import('html2canvas'),

    import('jspdf'),

  ]);



  applyReachCertificateA4Size(element);

  await waitForLayout();



  const scale = Math.max(2, Math.min(3, window.devicePixelRatio || 2));

  const canvas = await html2canvas(element, {

    scale,

    useCORS: true,

    allowTaint: true,

    backgroundColor: '#ffffff',

    logging: false,

    scrollX: 0,

    scrollY: 0,

    width: REACH_CERT_A4_WIDTH_PX,

    height: REACH_CERT_A4_HEIGHT_PX,

    windowWidth: REACH_CERT_A4_WIDTH_PX,

    windowHeight: REACH_CERT_A4_HEIGHT_PX,

  });



  if (canvas.width === 0 || canvas.height === 0) {

    throw new Error('Certificate preview failed to render for PDF.');

  }



  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  const pageWidth = pdf.internal.pageSize.getWidth();

  const pageHeight = pdf.internal.pageSize.getHeight();

  const imgData = canvas.toDataURL('image/jpeg', 0.95);



  pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');

  triggerBlobDownload(pdf.output('blob'), fileName);

}



export async function downloadReachHtmlCertificatePdfFromElement(

  element: HTMLElement,

  fileName: string

): Promise<void> {

  await captureElementToPdf(element, fileName);

}



export async function downloadReachHtmlCertificatePdf(

  data: ReachCertificateHtmlData,

  fileName: string

): Promise<void> {

  const host = document.createElement('div');

  host.setAttribute('aria-hidden', 'true');

  host.style.cssText = `position:fixed;left:-12000px;top:0;z-index:-1;pointer-events:none;background:#ffffff;width:${REACH_CERT_A4_WIDTH_PX}px;height:${REACH_CERT_A4_HEIGHT_PX}px;overflow:hidden;`;

  document.body.appendChild(host);



  const [{ createRoot }, React, { default: ReachCertificateHtmlDocument }] = await Promise.all([
    import('react-dom/client'),
    import('react'),
    import('@/components/ReachCertificateHtmlDocument'),
    import('@/components/reach-certificate-fonts.css'),
    import('@/components/reach-certificate-a4.css'),
    import('@/components/reach-certificate-html.css'),
  ]);



  const root = createRoot(host);

  root.render(React.createElement(ReachCertificateHtmlDocument, { data }));



  try {

    await waitForLayout();

    await waitForImages(host);

    const certEl = host.querySelector('[data-reach-cert-root]');

    if (!(certEl instanceof HTMLElement)) {

      throw new Error('Certificate render failed.');

    }

    await captureElementToPdf(certEl, fileName);

  } finally {

    root.unmount();

    document.body.removeChild(host);

  }

}


