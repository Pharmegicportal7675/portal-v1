import type { DbClient } from '@/lib/db/types';
import {
  DOCX_CONTENT_TYPE,
  PDF_CONTENT_TYPE,
  uploadReachCertificateFile,
} from '@/lib/reach-certificate-storage';
import { generateReachCertificateHtmlPdf } from '@/lib/reach-certificate-html-pdf-server';
import type { LoadedReachCertificateInput } from '@/lib/reach-certificate-api-input';
import { buildReachDocxData } from '@/lib/reach-pdf-data';
import { generateReachCertificateDocx } from '@/services/reach-certificate-docx';
import type { ReachPdfChemical, ReachPdfSource } from '@/lib/reach-pdf-data';

export type ReachCertPdfInput = {
  certificateNumber: string;
  registrationNumber: string;
  issuedDate: string;
  validatedDate: string;
  client: ReachPdfSource;
  chemical: ReachPdfChemical;
  tonnageBand?: string | null;
};

export type ReachCertificatePreviewResult =
  | { mode: 'pdf'; buffer: Buffer; fileName: string }
  | { mode: 'docx'; docxUrl: string; fileName: string };

function toLoadedInput(input: ReachCertPdfInput & LoadedReachCertificateInput): LoadedReachCertificateInput {
  return input;
}

/**
 * Resolves RC preview PDF via Puppeteer HTML render; falls back to DOCX upload for legacy embed.
 */
export async function resolveReachCertificatePreview(
  supabase: DbClient,
  input: ReachCertPdfInput & LoadedReachCertificateInput
): Promise<ReachCertificatePreviewResult> {
  const certNumber = input.certificateNumber;
  const pdfFileName = `${certNumber}.pdf`;
  const docxFileName = `${certNumber}.docx`;
  const loaded = toLoadedInput(input);

  try {
    const pdfBuffer = await generateReachCertificateHtmlPdf(loaded);
    void uploadReachCertificateFile(supabase, pdfFileName, pdfBuffer, PDF_CONTENT_TYPE);
    return { mode: 'pdf', buffer: pdfBuffer, fileName: pdfFileName };
  } catch {
    // fall through to DOCX upload
  }

  const freshDocx = generateReachCertificateDocx(
    buildReachDocxData(input.client, input.chemical, {
      registrationNumber: input.registrationNumber,
      issuedDate: input.issuedDate,
      validatedDate: input.validatedDate,
      tonnageBand: input.tonnageBand,
    })
  );

  const docxUrl = await uploadReachCertificateFile(
    supabase,
    docxFileName,
    freshDocx,
    DOCX_CONTENT_TYPE
  );

  if (docxUrl) {
    return { mode: 'docx', docxUrl, fileName: docxFileName };
  }

  throw new Error('Certificate preview is temporarily unavailable. Please try again.');
}
