import {
  buildReachDocxData,
  type ReachCertificateDocxData,
  type ReachPdfChemical,
  type ReachPdfSource,
} from '@/lib/reach-certificate-data';
import { generateReachCertificateHtmlPdf } from '@/lib/reach-certificate-html-pdf-server';
import type { LoadedReachCertificateInput } from '@/lib/reach-certificate-api-input';
import {
  generateReachCertificateDocx,
} from '@/services/reach-certificate-docx';

export type { ReachCertificateDocxData, ReachPdfChemical, ReachPdfSource } from '@/lib/reach-certificate-data';
export { buildReachDocxData } from '@/lib/reach-certificate-data';

const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export type ReachCertificateStoredFile = {
  buffer: Buffer;
  fileName: string;
  contentType: string;
  format: 'pdf' | 'docx';
};

/** Build certificate file for storage — Puppeteer HTML PDF when available, else DOCX fallback. */
export async function buildReachCertificateStoredFile(
  client: ReachPdfSource,
  chemical: ReachPdfChemical,
  certNumber: string,
  options: {
    registrationNumber: string;
    issuedDate: string;
    validatedDate: string;
    tonnageBand?: string | null;
    clientId?: string;
    chemicalId?: string;
  }
): Promise<ReachCertificateStoredFile> {
  const input: LoadedReachCertificateInput = {
    certificateNumber: certNumber,
    registrationNumber: options.registrationNumber,
    issuedDate: options.issuedDate,
    validatedDate: options.validatedDate,
    client,
    chemical,
    tonnageBand: options.tonnageBand,
    clientId: options.clientId,
    chemicalId: options.chemicalId,
  };

  try {
    const pdfBuffer = await generateReachCertificateHtmlPdf(input);
    return {
      buffer: pdfBuffer,
      fileName: `${certNumber}.pdf`,
      contentType: 'application/pdf',
      format: 'pdf',
    };
  } catch {
    const docxBuffer = generateReachCertificateDocx(
      buildReachDocxData(client, chemical, options)
    );
    return {
      buffer: docxBuffer,
      fileName: `${certNumber}.docx`,
      contentType: DOCX_CONTENT_TYPE,
      format: 'docx',
    };
  }
}
