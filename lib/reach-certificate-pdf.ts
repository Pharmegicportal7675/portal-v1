import type { SupabaseClient } from '@supabase/supabase-js';
import { buildReachDocxData } from '@/lib/reach-pdf-data';
import type { ReachCertPdfInput } from '@/lib/reach-certificate-preview';
import { generateReachCertificateHtmlPdf } from '@/lib/reach-certificate-html-pdf-server';
import type { LoadedReachCertificateInput } from '@/lib/reach-certificate-api-input';
import { convertReachDocxToPdf, generateReachCertificateDocx } from '@/services/reach-certificate-docx';

const PDF_CONTENT_TYPE = 'application/pdf';

export type ReachCertificateDownloadFile = {
  buffer: Buffer;
  contentType: string;
  fileName: string;
  format: 'pdf';
};

function buildFreshReachDocx(input: ReachCertPdfInput): Buffer {
  return generateReachCertificateDocx(
    buildReachDocxData(input.client, input.chemical, {
      registrationNumber: input.registrationNumber,
      issuedDate: input.issuedDate,
      validatedDate: input.validatedDate,
      tonnageBand: input.tonnageBand,
    })
  );
}

/** Always builds a PDF from the HTML certificate template — throws when generation unavailable. */
export async function resolveReachCertificateDownloadFile(
  supabase: SupabaseClient,
  input: ReachCertPdfInput & LoadedReachCertificateInput
): Promise<ReachCertificateDownloadFile> {
  try {
    const pdfBuffer = await generateReachCertificateHtmlPdf(input);
    return {
      buffer: pdfBuffer,
      contentType: PDF_CONTENT_TYPE,
      fileName: `${input.certificateNumber}.pdf`,
      format: 'pdf',
    };
  } catch (htmlErr) {
    const freshDocx = buildFreshReachDocx(input);
    try {
      const pdfBuffer = await convertReachDocxToPdf(freshDocx);
      return {
        buffer: pdfBuffer,
        contentType: PDF_CONTENT_TYPE,
        fileName: `${input.certificateNumber}.pdf`,
        format: 'pdf',
      };
    } catch {
      const message =
        htmlErr instanceof Error
          ? htmlErr.message
          : 'PDF generation is not available on this server.';
      throw new Error(message);
    }
  }
}

export { buildReachCertificateStoredFile } from '@/lib/reach-pdf-data';
