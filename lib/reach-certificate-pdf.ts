import type { DbClient } from '@/lib/db/types';
import type { ReachCertPdfInput } from '@/lib/reach-certificate-preview';
import { generateReachCertificateHtmlPdf } from '@/lib/reach-certificate-html-pdf-server';
import type { LoadedReachCertificateInput } from '@/lib/reach-certificate-api-input';
import {
  loadReachCertificateStoredPdf,
  uploadReachCertificateFile,
} from '@/lib/reach-certificate-storage';

const PDF_CONTENT_TYPE = 'application/pdf';

export type ReachCertificateDownloadFile = {
  buffer: Buffer;
  contentType: string;
  fileName: string;
  format: 'pdf';
};

/** Builds a PDF — prefers stored upload, then HTML/Puppeteer (puppeteer-core + chromium-min). */
export async function resolveReachCertificateDownloadFile(
  supabase: DbClient,
  input: ReachCertPdfInput & LoadedReachCertificateInput,
  options?: { fileUrl?: string | null }
): Promise<ReachCertificateDownloadFile> {
  const stored = await loadReachCertificateStoredPdf(
    supabase,
    input.certificateNumber,
    options?.fileUrl
  );
  if (stored) {
    return {
      buffer: stored.buffer,
      contentType: PDF_CONTENT_TYPE,
      fileName: stored.fileName,
      format: 'pdf',
    };
  }

  try {
    const pdfBuffer = await generateReachCertificateHtmlPdf(input);
    void uploadReachCertificateFile(
      supabase,
      `${input.certificateNumber}.pdf`,
      pdfBuffer,
      PDF_CONTENT_TYPE
    );
    return {
      buffer: pdfBuffer,
      contentType: PDF_CONTENT_TYPE,
      fileName: `${input.certificateNumber}.pdf`,
      format: 'pdf',
    };
  } catch (htmlErr) {
    const message =
      htmlErr instanceof Error
        ? htmlErr.message
        : 'RC certificate PDF generation failed (Puppeteer/Chromium).';
    throw new Error(message);
  }
}

export { buildReachCertificateStoredFile } from '@/lib/reach-pdf-data';
