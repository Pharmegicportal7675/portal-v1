import fs from 'node:fs';
import path from 'node:path';
import type { TccCertificateHtmlData } from '@/lib/tcc-certificate-html-data';
import {
  REACH_CERT_A4_HEIGHT_PX,
  REACH_CERT_A4_WIDTH_PX,
} from '@/lib/reach-certificate-a4';
import { buildReachCertificateEmbeddedFontCss } from '@/lib/reach-certificate-fonts';

const CERTIFICATE_CSS_PATH = path.join(process.cwd(), 'components', 'tcc-certificate-html.css');
const A4_CSS_PATH = path.join(process.cwd(), 'components', 'reach-certificate-a4.css');

const PRINT_OVERRIDES = `
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
  page-break-after: always;
  margin: 0 !important;
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=${REACH_CERT_A4_WIDTH_PX}, initial-scale=1" />
<style>${fontCss}</style>
<style>${css}</style>
<style>${PRINT_OVERRIDES}</style>
</head>
<body data-reach-pdf-ready="true">
<div data-reach-cert-print-area>
${markup}
</div>
</body>
</html>`;
}
