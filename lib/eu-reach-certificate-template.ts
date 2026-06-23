import path from 'path';

const TEMPLATES_DIR = path.join(process.cwd(), 'templates');

/**
 * Single source of truth for EU REACH RC certificate template files.
 *
 * templates/
 *   EU_REACH_main.docx                 — runtime print/PDF (placeholders applied)
 *   source/EU_REACH_SOURCE.docx        — master Word file (edit design here)
 */
export const EU_REACH_TEMPLATE = {
  source: path.join(TEMPLATES_DIR, 'source', 'EU_REACH_SOURCE.docx'),
  runtime: path.join(TEMPLATES_DIR, 'EU_REACH_main.docx'),
  bundledPreviewPdf: path.join(
    process.cwd(),
    'public',
    'previews',
    'eu-reach-certificate-sample.pdf'
  ),
  bundledPreviewDocx: path.join(
    process.cwd(),
    'public',
    'previews',
    'eu-reach-certificate-sample.docx'
  ),
} as const;
