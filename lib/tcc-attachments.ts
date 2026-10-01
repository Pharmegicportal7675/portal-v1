import type { DbClient } from '@/lib/db/types';
import { buildClientYearStoragePath } from '@/lib/storage-paths';
import { resolveClientStorageFolder, extractClientFolderFromStorageUrl } from '@/lib/client-storage-folder';
import { CERTIFICATES_BUCKET, ensureCertificatesBucket } from '@/lib/storage';
import { resolveCertificatesFilePath } from '@/lib/certificates-upload-root';

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

function withUniqueFileSuffix(storagePath: string): string {
  const stamp = Date.now().toString(36);
  const slash = storagePath.lastIndexOf('/');
  const dot = storagePath.lastIndexOf('.');
  if (dot <= slash) return `${storagePath}-${stamp}`;
  return `${storagePath.slice(0, dot)}-${stamp}${storagePath.slice(dot)}`;
}

export async function uploadBoAttachment(
  supabase: DbClient,
  file: File,
  options: {
    clientId: string;
    clientName: string;
    folderDate?: string | Date | null;
    existingAttachmentUrl?: string | null;
    applicationId?: string;
  }
): Promise<{ url: string; name: string }> {
  const clientFolder = options.existingAttachmentUrl
    ? extractClientFolderFromStorageUrl(options.existingAttachmentUrl) ||
      (await resolveClientStorageFolder(supabase, options.clientId, options.clientName))
    : await resolveClientStorageFolder(supabase, options.clientId, options.clientName);

  let fileName = buildClientYearStoragePath(
    'PO',
    clientFolder,
    options.folderDate,
    file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  );

  const {
    data: { publicUrl: plannedUrl },
  } = supabase.storage.from(CERTIFICATES_BUCKET).getPublicUrl(fileName);
  const { data: sharedRows } = await supabase
    .from('tcc_applications')
    .select('id')
    .eq('bo_attachment_url', plannedUrl)
    .limit(5);
  const usedByAnotherApplication = (sharedRows || []).some(
    (row: { id?: string }) => row.id && row.id !== options.applicationId
  );
  const ownUrl = options.existingAttachmentUrl?.trim() || '';
  const fileAlreadyStored = Boolean(resolveCertificatesFilePath(fileName));
  if (usedByAnotherApplication || (fileAlreadyStored && plannedUrl !== ownUrl)) {
    fileName = withUniqueFileSuffix(fileName);
  }
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
