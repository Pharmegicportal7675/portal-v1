import type { DbClient } from '@/lib/db/types';
import { CERTIFICATES_BUCKET } from '@/lib/storage';
import { convertReachDocxToPdf } from '@/services/reach-certificate-docx';

const PDF_CONTENT_TYPE = 'application/pdf';
const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function extractCertificateFileName(fileUrl: string): string | null {
  const trimmed = fileUrl.trim();
  if (!trimmed) return null;
  try {
    const base = new URL(trimmed).pathname.split('/').pop();
    return base || null;
  } catch {
    const parts = trimmed.split('/');
    return parts[parts.length - 1] || null;
  }
}

async function tryStoredPdf(
  supabase: DbClient,
  fileName: string
): Promise<{ buffer: Buffer; fileName: string } | null> {
  const buffer = await downloadReachCertificateFile(supabase, fileName);
  if (!buffer) return null;
  if (fileName.toLowerCase().endsWith('.pdf')) {
    return { buffer, fileName };
  }
  if (fileName.toLowerCase().endsWith('.docx')) {
    try {
      const pdfBuffer = await convertReachDocxToPdf(buffer);
      return { buffer: pdfBuffer, fileName: fileName.replace(/\.docx$/i, '.pdf') };
    } catch {
      return null;
    }
  }
  return null;
}

/** Serve an already-uploaded RC certificate file when Puppeteer is unavailable on the server. */
export async function loadReachCertificateStoredPdf(
  supabase: DbClient,
  certificateNumber: string,
  fileUrl?: string | null
): Promise<{ buffer: Buffer; fileName: string } | null> {
  const candidates = new Set<string>();
  candidates.add(`${certificateNumber}.pdf`);
  candidates.add(`${certificateNumber}.docx`);

  const fromUrl = fileUrl ? extractCertificateFileName(fileUrl) : null;
  if (fromUrl) candidates.add(fromUrl);

  for (const fileName of candidates) {
    const stored = await tryStoredPdf(supabase, fileName);
    if (stored) return stored;
  }

  return null;
}

/** Remove cached certificate files so stale Template 1 PDFs cannot be served. */
export async function clearReachCertificateStorageFiles(
  supabase: DbClient,
  certificateNumber: string
): Promise<void> {
  await supabase.storage
    .from(CERTIFICATES_BUCKET)
    .remove([`${certificateNumber}.pdf`, `${certificateNumber}.docx`]);
}

export async function downloadReachCertificateFile(
  supabase: DbClient,
  fileName: string
): Promise<Buffer | null> {
  const { data, error } = await supabase.storage.from(CERTIFICATES_BUCKET).download(fileName);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

export async function uploadReachCertificateFile(
  supabase: DbClient,
  fileName: string,
  buffer: Buffer,
  contentType: string
): Promise<string | null> {
  const { error } = await supabase.storage.from(CERTIFICATES_BUCKET).upload(fileName, buffer, {
    contentType,
    upsert: true,
  });
  if (error) return null;

  const {
    data: { publicUrl },
  } = supabase.storage.from(CERTIFICATES_BUCKET).getPublicUrl(fileName);
  return publicUrl;
}

export { PDF_CONTENT_TYPE, DOCX_CONTENT_TYPE };
