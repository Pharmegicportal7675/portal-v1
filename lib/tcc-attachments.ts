import type { DbClient } from '@/lib/db/types';
import { buildBoStoragePath } from '@/lib/storage-paths';
import { CERTIFICATES_BUCKET, ensureCertificatesBucket } from '@/lib/storage';

const MAX_BO_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
]);

const ALLOWED_MIME_PREFIXES = [
  'image/',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
];

export function validateBoAttachment(file: File): { ok: true } | { ok: false; error: string } {
  if (file.size > MAX_BO_BYTES) {
    return { ok: false, error: 'PO file must be 10 MB or smaller.' };
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      error: 'Allowed formats: image, PDF, DOC, DOCX, Excel, PPT.',
    };
  }

  const mimeOk =
    ALLOWED_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix)) ||
    file.type === '' ||
    file.type === 'application/octet-stream';

  if (!mimeOk && file.type) {
    return { ok: false, error: 'Unsupported file type for PO attachment.' };
  }

  return { ok: true };
}

export async function uploadBoAttachment(
  supabase: DbClient,
  file: File,
  options: {
    clientName: string;
    folderDate?: string | Date | null;
  }
): Promise<{ url: string; name: string }> {
  const fileName = buildBoStoragePath(options.clientName, options.folderDate, file.name);
  const buffer = Buffer.from(await file.arrayBuffer());

  await ensureCertificatesBucket(supabase);

  const { error: uploadError } = await supabase.storage
    .from(CERTIFICATES_BUCKET)
    .upload(fileName, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`PO upload failed: ${uploadError.message}`);
  }

  const { data } = supabase.storage.from(CERTIFICATES_BUCKET).getPublicUrl(fileName);
  return { url: data.publicUrl, name: file.name };
}
