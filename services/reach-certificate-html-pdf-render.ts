import fs from 'node:fs';
import path from 'node:path';
import type { ReachCertificateHtmlData } from '@/lib/reach-certificate-html-data';
import {
  REACH_CERT_A4_HEIGHT_PX,
  REACH_CERT_A4_WIDTH_PX,
} from '@/lib/reach-certificate-a4';
import { buildReachCertificateEmbeddedFontCss } from '@/lib/reach-certificate-fonts';

const CERTIFICATE_CSS_PATH = path.join(process.cwd(), 'components', 'reach-certificate-html.css');
const A4_CSS_PATH = path.join(process.cwd(), 'components', 'reach-certificate-a4.css');

const PRINT_OVERRIDES = `
html, body {
  margin: 0;
  padding: 0;
  width: ${REACH_CERT_A4_WIDTH_PX}px;
  height: ${REACH_CERT_A4_HEIGHT_PX}px;
  max-width: ${REACH_CERT_A4_WIDTH_PX}px;
  max-height: ${REACH_CERT_A4_HEIGHT_PX}px;
  overflow: hidden;
  background: #ffffff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
[data-reach-cert-print-area] {
  width: ${REACH_CERT_A4_WIDTH_PX}px;
  height: ${REACH_CERT_A4_HEIGHT_PX}px;
  margin: 0;
  padding: 0;
  overflow: hidden;
}
[data-reach-cert-root] {
  font-family: 'Verdana', Geneva, Tahoma, sans-serif;
}
[data-reach-cert-root].reach-cert-page {
  margin: 0;
}
[data-reach-cert-root] .reach-cert-title {
  font-family: 'Times New Roman', Times, serif !important;
}
[data-reach-cert-root] p {
  margin: 0;
  padding: 0;
}
[data-reach-cert-root] .reach-manufacturer-label {
  margin: 0 0 2px !important;
  line-height: 1 !important;
}
[data-reach-cert-root] .reach-manufacturer-name {
  margin: 0 0 4px !important;
  line-height: 1.15 !important;
}
[data-reach-cert-root] .reach-date-label {
  font-family: 'Arial', Helvetica, sans-serif !important;
}
[data-reach-cert-root] .reach-date-value {
  font-family: 'Arial', Helvetica, sans-serif !important;
}
`;

function loadCertificateCss(): string {
  const certificateCss = fs.readFileSync(CERTIFICATE_CSS_PATH, 'utf8');
  const a4Css = fs.readFileSync(A4_CSS_PATH, 'utf8');
  return `${a4Css}\n${certificateCss}`;
}

/** Full HTML document for Puppeteer — static markup, no client hydration. */
export async function renderReachCertificateHtmlDocument(
  data: ReachCertificateHtmlData
): Promise<string> {
  const [{ renderToStaticMarkup }, { createElement }, { default: ReachCertificateHtmlDocument }] =
    await Promise.all([
      import('react-dom/server'),
      import('react'),
      import('@/components/ReachCertificateHtmlDocument'),
    ]);

  const markup = renderToStaticMarkup(createElement(ReachCertificateHtmlDocument, { data }));
  const css = loadCertificateCss();
  const fontCss = buildReachCertificateEmbeddedFontCss();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=794, initial-scale=1" />
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
