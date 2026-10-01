import 'server-only';

import fs from 'node:fs/promises';
import path from 'node:path';
import { createAdminClient } from '@/lib/db/admin';
import {
  findCertificatesFileByNames,
  resolveCertificatesFilePath,
} from '@/lib/certificates-upload-root';
import { collectPoAttachmentRelativePaths } from '@/lib/tcc-po-attachment-paths';

export type PoAttachmentSnapshot = {
  url: string;
  name: string | null;
  diskPath: string | null;
  bytes: Buffer | null;
};

function looksLikeStoredFile(buffer: Buffer): boolean {
  if (buffer.length === 0) return false;
  const head = buffer.subarray(0, 80).toString('utf8').trimStart().toLowerCase();
  if (head.startsWith('<!doctype') || head.startsWith('<html')) return false;
  if (head.startsWith('{') || head.startsWith('[')) return false;
  return true;
}

async function readExistingPoFile(
  storedUrl: string,
  fileName: string | null
): Promise<{ diskPath: string; bytes: Buffer } | null> {
  const candidates = collectPoAttachmentRelativePaths(storedUrl);
  for (const candidate of candidates) {
    const diskPath = resolveCertificatesFilePath(candidate);
    if (!diskPath) continue;
    try {
      const bytes = await fs.readFile(diskPath);
      if (looksLikeStoredFile(bytes)) return { diskPath, bytes };
    } catch {
      // try the next candidate
    }
  }

  const names = [
    fileName,
    ...candidates.map((candidate) => path.basename(candidate)),
  ].filter((value): value is string => Boolean(value?.trim()));
  const discovered = findCertificatesFileByNames(names);
  if (!discovered) return null;

  try {
    const bytes = await fs.readFile(discovered);
    if (!looksLikeStoredFile(bytes)) return null;
    return { diskPath: discovered, bytes };
  } catch {
    return null;
  }
}

/** Read the current PO url and file bytes before a TCC update regenerates the certificate. */
export async function snapshotPoAttachment(
  applicationId: string
): Promise<PoAttachmentSnapshot | null> {
  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from('tcc_applications')
    .select('bo_attachment_url, bo_attachment_name')
    .eq('id', applicationId)
    .maybeSingle();

  if (error || !data?.bo_attachment_url?.trim()) return null;

  const existing = await readExistingPoFile(data.bo_attachment_url, data.bo_attachment_name);
  return {
    url: data.bo_attachment_url,
    name: data.bo_attachment_name ?? null,
    diskPath: existing?.diskPath ?? null,
    bytes: existing?.bytes ?? null,
  };
}

/**
 * Put the PO url, name, and file back if certificate regeneration changed them.
 * A TCC field update must keep the client upload that was already on the application.
 */
export async function restorePoAttachment(
  applicationId: string,
  snapshot: PoAttachmentSnapshot
): Promise<void> {
  const adminSupabase = createAdminClient();
  const { data } = await adminSupabase
    .from('tcc_applications')
    .select('bo_attachment_url, bo_attachment_name')
    .eq('id', applicationId)
    .maybeSingle();

  if (
    data &&
    (data.bo_attachment_url !== snapshot.url || (data.bo_attachment_name ?? null) !== snapshot.name)
  ) {
    await adminSupabase
      .from('tcc_applications')
      .update({
        bo_attachment_url: snapshot.url,
        bo_attachment_name: snapshot.name,
      })
      .eq('id', applicationId);
  }

  if (!snapshot.diskPath || !snapshot.bytes) return;

  let current: Buffer | null = null;
  try {
    current = await fs.readFile(snapshot.diskPath);
  } catch {
    current = null;
  }

  if (current && current.equals(snapshot.bytes)) return;

  await fs.mkdir(path.dirname(snapshot.diskPath), { recursive: true });
  await fs.writeFile(snapshot.diskPath, snapshot.bytes);
}
