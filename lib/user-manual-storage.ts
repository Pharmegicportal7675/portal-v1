import type { DbClient } from '@/lib/db/types';
import { CERTIFICATES_BUCKET } from '@/lib/storage';

/** File + metadata for the shared "User Manual" download (any format the admin uploads). */
const USER_MANUAL_DATA_PATH = 'user-manual/data.bin';
const USER_MANUAL_MANIFEST_PATH = 'user-manual/manifest.json';

const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

export type UserManualManifest = {
  fileName: string;
  contentType: string;
  size: number;
  uploadedAt: string;
};

export type UserManualFile = UserManualManifest & { buffer: Buffer };

function sanitizeFileName(name: string): string {
  const trimmed = name.trim().replace(/[\r\n"\\]/g, '').replace(/[/]/g, '-');
  return trimmed || 'user-manual';
}

async function blobToBuffer(blob: Blob): Promise<Buffer> {
  return Buffer.from(await blob.arrayBuffer());
}

/** Reads the current manual manifest, or null when nothing has been uploaded. */
export async function getUserManualManifest(
  supabase: DbClient
): Promise<UserManualManifest | null> {
  const { data, error } = await supabase.storage
    .from(CERTIFICATES_BUCKET)
    .download(USER_MANUAL_MANIFEST_PATH);
  if (error || !data) return null;

  try {
    const raw = (await blobToBuffer(data)).toString('utf8');
    const parsed = JSON.parse(raw) as Partial<UserManualManifest>;
    if (!parsed.fileName) return null;
    return {
      fileName: sanitizeFileName(parsed.fileName),
      contentType: parsed.contentType || DEFAULT_CONTENT_TYPE,
      size: Number(parsed.size ?? 0),
      uploadedAt: parsed.uploadedAt || '',
    };
  } catch {
    return null;
  }
}

/** Reads the current manual (metadata + bytes), or null when nothing has been uploaded. */
export async function getUserManual(supabase: DbClient): Promise<UserManualFile | null> {
  const manifest = await getUserManualManifest(supabase);
  if (!manifest) return null;

  const { data, error } = await supabase.storage
    .from(CERTIFICATES_BUCKET)
    .download(USER_MANUAL_DATA_PATH);
  if (error || !data) return null;

  return { ...manifest, buffer: await blobToBuffer(data) };
}

/** Stores (or replaces) the shared user manual. Admin-only at the API layer. */
export async function saveUserManual(
  supabase: DbClient,
  file: { buffer: Buffer; fileName: string; contentType: string }
): Promise<UserManualManifest> {
  const contentType = file.contentType?.trim() || DEFAULT_CONTENT_TYPE;

  const upload = await supabase.storage
    .from(CERTIFICATES_BUCKET)
    .upload(USER_MANUAL_DATA_PATH, file.buffer, { contentType, upsert: true });
  if (upload.error) {
    throw new Error(upload.error.message || 'Failed to store user manual.');
  }

  const manifest: UserManualManifest = {
    fileName: sanitizeFileName(file.fileName),
    contentType,
    size: file.buffer.length,
    uploadedAt: new Date().toISOString(),
  };

  const manifestUpload = await supabase.storage
    .from(CERTIFICATES_BUCKET)
    .upload(USER_MANUAL_MANIFEST_PATH, Buffer.from(JSON.stringify(manifest), 'utf8'), {
      contentType: 'application/json',
      upsert: true,
    });
  if (manifestUpload.error) {
    throw new Error(manifestUpload.error.message || 'Failed to store user manual metadata.');
  }

  return manifest;
}

/** Deletes the stored user manual (file + metadata). Admin-only at the API layer. */
export async function removeUserManual(supabase: DbClient): Promise<void> {
  await supabase.storage
    .from(CERTIFICATES_BUCKET)
    .remove([USER_MANUAL_DATA_PATH, USER_MANUAL_MANIFEST_PATH]);
}
