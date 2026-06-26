import fs from 'node:fs';
import path from 'node:path';
import type { TccCertificateHtmlData } from '@/lib/tcc-certificate-html-data';
import {
  REACH_CERT_A4_CSS_VARS,
  REACH_CERT_A4_HEIGHT_PX,
  REACH_CERT_A4_PADDING_BOTTOM_PX,
  REACH_CERT_A4_PADDING_PX,
  REACH_CERT_A4_WIDTH_PX,
} from '@/lib/reach-certificate-a4';
import { buildReachCertificateEmbeddedFontCss } from '@/lib/reach-certificate-fonts';

const CERTIFICATE_CSS_PATH = path.join(process.cwd(), 'components', 'tcc-certificate-html.css');
const A4_CSS_PATH = path.join(process.cwd(), 'components', 'reach-certificate-a4.css');

/** Puppeteer PDF — bottom padding 60px (preview screen uses 50px all sides). */
const PDF_RENDER_OVERRIDES = `
html, body {
  margin: 0;
  padding: 0;
  width: ${REACH_CERT_A4_WIDTH_PX}px;
  height: auto;
  overflow: visible;
  background: #ffffff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
[data-reach-cert-print-area] {
  width: ${REACH_CERT_A4_WIDTH_PX}px;
  margin: 0;
  padding: 0;
}
[data-tcc-cert-root] p {
  margin: 0;
  padding: 0;
}
[data-tcc-cert-root] .tcc-manufacturer-label {
  margin: 0 0 2px !important;
  line-height: 1 !important;
}
[data-tcc-cert-root] .tcc-manufacturer-name {
  margin: 0 0 4px !important;
  line-height: 1.15 !important;
}
[data-tcc-cert-root] .tcc-date-label,
[data-tcc-cert-root] .tcc-date-value,
[data-tcc-cert-root] .tcc-shipment-label {
  font-family: 'Arial', Helvetica, sans-serif !important;
}
[data-tcc-cert-root] .tcc-cert-footer,
[data-tcc-cert-root] .tcc-footer-line {
  font-family: 'Verdana', Geneva, Tahoma, sans-serif !important;
}
[data-tcc-cert-root].tcc-cert-page {
  width: ${REACH_CERT_A4_WIDTH_PX}px !important;
  height: ${REACH_CERT_A4_HEIGHT_PX}px !important;
  max-width: ${REACH_CERT_A4_WIDTH_PX}px !important;
  min-height: ${REACH_CERT_A4_HEIGHT_PX}px !important;
  max-height: ${REACH_CERT_A4_HEIGHT_PX}px !important;
  padding: ${REACH_CERT_A4_PADDING_PX}px ${REACH_CERT_A4_PADDING_PX}px ${REACH_CERT_A4_PADDING_BOTTOM_PX}px ${REACH_CERT_A4_PADDING_PX}px !important;
  margin: 0 !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
  page-break-after: always;
}
[data-tcc-cert-root].tcc-cert-page:last-child {
  page-break-after: auto;
  margin-bottom: 0 !important;
}
[data-tcc-cert-root] .tcc-cert-frame {
  height: 100% !important;
  max-height: 100% !important;
  box-sizing: border-box !important;
  display: flex !important;
  flex-direction: column !important;
}
[data-tcc-cert-root] .tcc-cert-body {
  display: flex !important;
  flex-direction: column !important;
  flex: 1 1 auto !important;
  min-height: 0 !important;
}
[data-tcc-cert-root] .tcc-seal-area {
  flex: 1 1 auto !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}
`;

function loadCertificateCss(): string {
  const certificateCss = fs.readFileSync(CERTIFICATE_CSS_PATH, 'utf8');
  const a4Css = fs.readFileSync(A4_CSS_PATH, 'utf8');
  return `${a4Css}\n${certificateCss}`;
}

export async function renderTccCertificateHtmlDocument(
  data: TccCertificateHtmlData
): Promise<string> {
  const [{ renderToStaticMarkup }, { createElement }, { default: TccCertificateHtmlDocument }] =
    await Promise.all([
      import('react-dom/server'),
      import('react'),
      import('@/components/TccCertificateHtmlDocument'),
    ]);

  const markup = renderToStaticMarkup(createElement(TccCertificateHtmlDocument, { data }));
  const css = loadCertificateCss();
  const fontCss = buildReachCertificateEmbeddedFontCss();
  const pdfRootStyle = Object.entries(REACH_CERT_A4_CSS_VARS)
    .map(([key, value]) => `${key}:${value}`)
    .join(';');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=${REACH_CERT_A4_WIDTH_PX}, initial-scale=1" />
<style>${fontCss}</style>
<style>${css}</style>
<style>${PDF_RENDER_OVERRIDES}</style>
</head>
<body data-reach-pdf-ready="true" style="${pdfRootStyle}">
<div data-reach-cert-print-area>
${markup}
</div>
</body>
</html>`;
}
