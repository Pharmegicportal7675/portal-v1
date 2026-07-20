import type { DbClient } from '@/lib/db/types';
import {
  extractStorageRelativePath,
  sanitizeStorageFolderName,
} from '@/lib/storage-paths';

/** First path segment from a stored certificate/PO URL, e.g. `NAVPAD_PIGMENTS_PRIVATE_LIMITED`. */
export function extractClientFolderFromStorageUrl(
  fileUrl: string | null | undefined
): string | null {
  const relative = extractStorageRelativePath(fileUrl || '');
  if (!relative) return null;
  const [clientFolder] = relative.split('/').filter(Boolean);
  return clientFolder || null;
}

/**
 * Reuse the client folder already used on live uploads for this client.
 * Falls back to sanitized company name only when no prior uploads exist.
 */
export async function resolveClientStorageFolder(
  supabase: DbClient,
  clientId: string,
  companyName: string
): Promise<string> {
  const { data: poRows } = await supabase
    .from('tcc_applications')
    .select('bo_attachment_url')
    .eq('client_id', clientId)
    .not('bo_attachment_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5);

  for (const row of poRows ?? []) {
    const folder = extractClientFolderFromStorageUrl(row.bo_attachment_url);
    if (folder) return folder;
  }

  const { data: certRows } = await supabase
    .from('certificates')
    .select('file_url')
    .eq('client_id', clientId)
    .not('file_url', 'is', null)
    .order('issued_at', { ascending: false })
    .limit(5);

  for (const row of certRows ?? []) {
    const folder = extractClientFolderFromStorageUrl(row.file_url);
    if (folder) return folder;
  }

  return sanitizeStorageFolderName(companyName);
}
