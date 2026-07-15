import type { DbClient } from '@/lib/db/types';
import type { ReachCertPdfInput } from '@/lib/reach-certificate-preview';
import { generateReachCertificateHtmlPdf } from '@/lib/reach-certificate-html-pdf-server';
import type { LoadedReachCertificateInput } from '@/lib/reach-certificate-api-input';
import { buildClientYearStoragePath } from '@/lib/storage-paths';
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

/** Builds a PDF — always renders with current HTML/CSS, then refreshes storage. */
export async function resolveReachCertificateDownloadFile(
  supabase: DbClient,
  input: ReachCertPdfInput & LoadedReachCertificateInput,
  options?: { fileUrl?: string | null; withoutStamp?: boolean }
): Promise<ReachCertificateDownloadFile> {
  // Without-stamp copies are admin-only, on-demand renders. Never cache them to
  // storage (that would overwrite the official stamped PDF) and never fall back
  // to the stored file (which always includes the stamp).
  if (options?.withoutStamp) {
    const pdfBuffer = await generateReachCertificateHtmlPdf(input, { withoutStamp: true });
    return {
      buffer: pdfBuffer,
      contentType: PDF_CONTENT_TYPE,
      fileName: `${input.certificateNumber}-unstamped.pdf`,
      format: 'pdf',
    };
  }

  try {
    const pdfBuffer = await generateReachCertificateHtmlPdf(input);
    const clientName = input.client.company_name || 'client';
    const storagePath = buildClientYearStoragePath(
      'RC',
      clientName,
      input.issuedDate,
      `${input.certificateNumber}.pdf`
    );
    void uploadReachCertificateFile(supabase, storagePath, pdfBuffer, PDF_CONTENT_TYPE);
    return {
      buffer: pdfBuffer,
      contentType: PDF_CONTENT_TYPE,
      fileName: `${input.certificateNumber}.pdf`,
      format: 'pdf',
    };
  } catch (htmlErr) {
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

    const message =
      htmlErr instanceof Error
        ? htmlErr.message
        : 'CT certificate PDF generation failed (Puppeteer/Chromium).';
    throw new Error(message);
  }
}

export { buildReachCertificateStoredFile } from '@/lib/reach-pdf-data';
