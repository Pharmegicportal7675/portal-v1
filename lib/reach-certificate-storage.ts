import type { DbClient } from '@/lib/db/types';
import { CERTIFICATES_BUCKET } from '@/lib/storage';

const PDF_CONTENT_TYPE = 'application/pdf';
const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

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
