'use server';

import path from 'node:path';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/db/admin';
import { getSession } from '@/lib/auth/session';
import { writeActivityLog } from '@/lib/activity-log';
import { formatErrorMessage } from '@/lib/format-error';
import {
  findCertificatesFileByNames,
  resolveCertificatesFilePath,
} from '@/lib/certificates-upload-root';
import { extractStorageRelativePath } from '@/lib/storage-paths';
import { collectPoAttachmentRelativePaths } from '@/lib/tcc-po-attachment-paths';
import { validateBoAttachment, uploadBoAttachment } from '@/lib/tcc-attachments';
import { regenerateTccCertificateFile } from '@/lib/regenerate-tcc-certificate-file';
import { regenerateMissingReachCertificateFiles } from '@/lib/regenerate-reach-certificate-file';
import { regenerateReachCertificateFile } from '@/services/reach-certificate-create';
import { REACH_CERTIFICATE_TYPE } from '@/lib/reach-certificate';
import { cleanupOrphanCertificateFiles } from '@/lib/cleanup-orphan-certificate-files';
import { ensureCertificateFolderStructure } from '@/lib/ensure-certificate-folder-structure';

async function requireSuperAdmin() {
  const session = await getSession();
  if (!session || session.role !== 'SUPER_ADMIN') return null;
  return session;
}

export type MissingPoRow = {
  id: string;
  clientId: string;
  companyName: string;
  attachmentName: string | null;
  attachmentUrl: string;
  expectedPath: string | null;
  trackingId: string | null;
  exportDate: string | null;
  createdAt: string | null;
};

export type CertificateFileStatusRow = {
  id: string;
  certificateNumber: string;
  type: 'TCC' | 'REACH';
  companyName: string;
  fileUrl: string | null;
  relativePath: string | null;
  onDisk: boolean;
};

function isPoMissingOnDisk(
  attachmentUrl: string | null | undefined,
  attachmentName: string | null | undefined
): boolean {
  if (!attachmentUrl?.trim()) return true;

  const candidates = collectPoAttachmentRelativePaths(attachmentUrl);
  for (const relative of candidates) {
    if (resolveCertificatesFilePath(relative)) return false;
  }

  const searchNames = [
    attachmentName?.trim(),
    ...candidates.map((c) => path.basename(c)),
  ].filter((v): v is string => Boolean(v));

  if (searchNames.length > 0 && findCertificatesFileByNames(searchNames)) {
    return false;
  }

  return true;
}

function isCertMissingOnDisk(fileUrl: string | null | undefined): boolean {
  const relative = extractStorageRelativePath(fileUrl || '');
  if (!relative) return true;
  return !resolveCertificatesFilePath(relative);
}

export async function listMissingPoApplicationsAction(): Promise<{
  success: boolean;
  error?: string;
  rows?: MissingPoRow[];
}> {
  const session = await requireSuperAdmin();
  if (!session) return { success: false, error: 'Unauthorized. Super Admin only.' };

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('tcc_applications')
      .select(
        'id, client_id, bo_attachment_url, bo_attachment_name, tracking_id, export_date, created_at'
      )
      .order('created_at', { ascending: false });

    if (error) return { success: false, error: formatErrorMessage(error) };

    type AppRow = {
      id: string;
      client_id: string;
      bo_attachment_url: string | null;
      bo_attachment_name: string | null;
      tracking_id: string | null;
      export_date: string | null;
      created_at: string | null;
    };

    const apps = (data ?? []) as AppRow[];
    const candidateApps = apps.filter(
      (row) =>
        Boolean(row.bo_attachment_url?.trim()) &&
        isPoMissingOnDisk(row.bo_attachment_url, row.bo_attachment_name)
    );

    const clientIds = [...new Set(candidateApps.map((r) => r.client_id).filter(Boolean))];
    const companyById = new Map<string, string>();
    if (clientIds.length > 0) {
      const { data: clients } = await admin
        .from('clients')
        .select('id, company_name')
        .in('id', clientIds);
      for (const c of (clients ?? []) as Array<{ id: string; company_name: string | null }>) {
        companyById.set(c.id, c.company_name || 'Unknown');
      }
    }

    const rows: MissingPoRow[] = [];
    for (const row of candidateApps) {
      const expectedPath =
        extractStorageRelativePath(row.bo_attachment_url || '') ||
        collectPoAttachmentRelativePaths(row.bo_attachment_url)[0] ||
        null;

      rows.push({
        id: row.id,
        clientId: row.client_id,
        companyName: companyById.get(row.client_id) || 'Unknown',
        attachmentName: row.bo_attachment_name,
        attachmentUrl: row.bo_attachment_url || '',
        expectedPath,
        trackingId: row.tracking_id,
        exportDate: row.export_date,
        createdAt: row.created_at,
      });
    }

    return { success: true, rows };
  } catch (err) {
    return { success: false, error: formatErrorMessage(err) };
  }
}

export async function uploadMissingPoAction(
  applicationId: string,
  formData: FormData
): Promise<{ success: boolean; error?: string; message?: string }> {
  const session = await requireSuperAdmin();
  if (!session) return { success: false, error: 'Unauthorized. Super Admin only.' };

  const file = formData.get('bo_attachment');
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: 'PO file is required.' };
  }

  const validated = validateBoAttachment(file);
  if (!validated.ok) return { success: false, error: validated.error };

  try {
    const admin = createAdminClient();
    const { data: app, error } = await admin
      .from('tcc_applications')
      .select(
        'id, client_id, export_date, bo_attachment_url, clients(company_name)'
      )
      .eq('id', applicationId)
      .maybeSingle();

    if (error) return { success: false, error: formatErrorMessage(error) };
    if (!app) return { success: false, error: 'TCC application not found.' };

    const clients = app.clients as
      | { company_name?: string }
      | { company_name?: string }[]
      | null;
    const companyName = Array.isArray(clients)
      ? clients[0]?.company_name || 'client'
      : clients?.company_name || 'client';

    const { url, name } = await uploadBoAttachment(admin, file, {
      clientId: app.client_id,
      clientName: companyName,
      folderDate: app.export_date,
      existingAttachmentUrl: app.bo_attachment_url,
    });

    const { error: updateError } = await admin
      .from('tcc_applications')
      .update({
        bo_attachment_url: url,
        bo_attachment_name: name,
      })
      .eq('id', applicationId);

    if (updateError) return { success: false, error: formatErrorMessage(updateError) };

    await writeActivityLog(admin, {
      user_id: session.userId,
      action: 'SUPER_PO_UPLOAD',
      entity_type: 'tcc_applications',
      entity_id: applicationId,
      description: `Super Admin uploaded missing PO for ${companyName}: ${name}`,
      metadata: {
        application_id: applicationId,
        client_id: app.client_id,
        file_name: name,
        file_url: url,
      },
    });

    revalidatePath('/admin/super');
    revalidatePath('/admin/approvals');
    revalidatePath(`/admin/clients/${app.client_id}`);
    return { success: true, message: `PO uploaded: ${name}` };
  } catch (err) {
    return { success: false, error: formatErrorMessage(err) };
  }
}

export async function listCertificateFileStatusAction(): Promise<{
  success: boolean;
  error?: string;
  rows?: CertificateFileStatusRow[];
}> {
  const session = await requireSuperAdmin();
  if (!session) return { success: false, error: 'Unauthorized. Super Admin only.' };

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('certificates')
      .select('id, certificate_number, type, file_url, status, client_id')
      .neq('status', 'revoked')
      .in('type', ['TCC', REACH_CERTIFICATE_TYPE])
      .order('created_at', { ascending: false });

    if (error) return { success: false, error: formatErrorMessage(error) };

    type CertStatusDbRow = {
      id: string;
      certificate_number: string | null;
      type: string | null;
      file_url: string | null;
      status: string | null;
      client_id: string | null;
    };

    const list = (data ?? []) as CertStatusDbRow[];
    const clientIds = [...new Set(list.map((r) => r.client_id).filter(Boolean))] as string[];
    const companyById = new Map<string, string>();

    if (clientIds.length > 0) {
      const { data: clients } = await admin
        .from('clients')
        .select('id, company_name')
        .in('id', clientIds);
      for (const c of (clients ?? []) as Array<{ id: string; company_name: string | null }>) {
        companyById.set(c.id, c.company_name || 'Unknown');
      }
    }

    const rows: CertificateFileStatusRow[] = list.map((row) => {
      const type = row.type === 'TCC' ? 'TCC' : 'REACH';
      const relativePath = extractStorageRelativePath(row.file_url || '');
      return {
        id: row.id,
        certificateNumber: row.certificate_number || row.id,
        type,
        companyName: (row.client_id && companyById.get(row.client_id)) || 'Unknown',
        fileUrl: row.file_url,
        relativePath,
        onDisk: !isCertMissingOnDisk(row.file_url),
      };
    });

    return { success: true, rows };
  } catch (err) {
    return { success: false, error: formatErrorMessage(err) };
  }
}

export async function regenerateMissingCertificatesAction(options?: {
  types?: Array<'TCC' | 'REACH'>;
}): Promise<{
  success: boolean;
  error?: string;
  message?: string;
  tcc?: { total: number; missing: number; regenerated: number; errors: string[] };
  reach?: { total: number; missing: number; regenerated: number; errors: string[] };
}> {
  const session = await requireSuperAdmin();
  if (!session) return { success: false, error: 'Unauthorized. Super Admin only.' };

  const types = options?.types?.length ? options.types : (['TCC', 'REACH'] as const);
  const admin = createAdminClient();

  try {
    let tccResult:
      | { total: number; missing: number; regenerated: number; errors: string[] }
      | undefined;
    let reachResult:
      | { total: number; missing: number; regenerated: number; errors: string[] }
      | undefined;

    if (types.includes('TCC')) {
      const { data: tccCerts, error: tccError } = await admin
        .from('certificates')
        .select('id, certificate_number, file_url')
        .eq('type', 'TCC')
        .neq('status', 'revoked');
      if (tccError) return { success: false, error: formatErrorMessage(tccError) };

      type TccRow = { id: string; certificate_number: string | null; file_url: string | null };
      const tccList = (tccCerts ?? []) as TccRow[];
      const missingTcc = tccList.filter((c) => isCertMissingOnDisk(c.file_url));
      tccResult = {
        total: tccList.length,
        missing: missingTcc.length,
        regenerated: 0,
        errors: [],
      };
      for (const row of missingTcc) {
        const number = row.certificate_number?.trim() || row.id;
        try {
          await regenerateTccCertificateFile(admin, row.id);
          tccResult.regenerated += 1;
        } catch (err) {
          tccResult.errors.push(
            `${number}: ${err instanceof Error ? err.message : 'failed'}`
          );
        }
      }
    }

    if (types.includes('REACH')) {
      reachResult = await regenerateMissingReachCertificateFiles({ dryRun: false });
    }

    await writeActivityLog(admin, {
      user_id: session.userId,
      action: 'SUPER_CERT_REGEN',
      entity_type: 'certificates',
      entity_id: null,
      description: `Super Admin regenerated missing certificates (${types.join(', ')})`,
      metadata: {
        types,
        tcc: tccResult ?? null,
        reach: reachResult ?? null,
      },
    });

    revalidatePath('/admin/super');
    revalidatePath('/admin/rc-certificates');
    revalidatePath('/admin/approvals');

    const regenCount = (tccResult?.regenerated ?? 0) + (reachResult?.regenerated ?? 0);
    const errCount = (tccResult?.errors.length ?? 0) + (reachResult?.errors.length ?? 0);
    return {
      success: true,
      message: `Regenerated ${regenCount} missing certificate file(s)${errCount ? ` (${errCount} error(s))` : ''}.`,
      tcc: tccResult,
      reach: reachResult,
    };
  } catch (err) {
    return { success: false, error: formatErrorMessage(err) };
  }
}

export async function forceRegenerateCertificateAction(
  certificateId: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  const session = await requireSuperAdmin();
  if (!session) return { success: false, error: 'Unauthorized. Super Admin only.' };

  if (!certificateId?.trim()) return { success: false, error: 'Certificate id is required.' };

  try {
    const admin = createAdminClient();
    const { data: cert, error } = await admin
      .from('certificates')
      .select('id, certificate_number, type, client_id')
      .eq('id', certificateId)
      .maybeSingle();

    if (error) return { success: false, error: formatErrorMessage(error) };
    if (!cert) return { success: false, error: 'Certificate not found.' };

    if (cert.type === 'TCC') {
      await regenerateTccCertificateFile(admin, cert.id);
    } else if (cert.type === REACH_CERTIFICATE_TYPE || cert.type === 'RC') {
      const regen = await regenerateReachCertificateFile(cert.id);
      if (!regen.success) return { success: false, error: regen.error || 'RC regenerate failed.' };
    } else {
      return { success: false, error: `Unsupported certificate type: ${cert.type}` };
    }

    await writeActivityLog(admin, {
      user_id: session.userId,
      action: 'SUPER_CERT_REGEN',
      entity_type: 'certificates',
      entity_id: cert.id,
      description: `Super Admin force-regenerated ${cert.certificate_number || cert.id}`,
      metadata: {
        certificate_id: cert.id,
        certificate_number: cert.certificate_number,
        type: cert.type,
        force: true,
      },
    });

    revalidatePath('/admin/super');
    if (cert.client_id) revalidatePath(`/admin/clients/${cert.client_id}`);
    return {
      success: true,
      message: `Regenerated ${cert.certificate_number || cert.id}.`,
    };
  } catch (err) {
    return { success: false, error: formatErrorMessage(err) };
  }
}

export async function ensureCertificateFoldersAction(): Promise<{
  success: boolean;
  error?: string;
  message?: string;
  created?: number;
  existing?: number;
  total?: number;
  uploadRoot?: string;
}> {
  const session = await requireSuperAdmin();
  if (!session) return { success: false, error: 'Unauthorized. Super Admin only.' };

  try {
    const result = await ensureCertificateFolderStructure({ dryRun: false });
    const admin = createAdminClient();
    await writeActivityLog(admin, {
      user_id: session.userId,
      action: 'SUPER_ENSURE_FOLDERS',
      entity_type: 'storage',
      entity_id: null,
      description: `Super Admin ensured certificate folders (${result.created} created, ${result.existing} existing)`,
      metadata: {
        created: result.created,
        existing: result.existing,
        total: result.total,
        uploadRoot: result.uploadRoot,
      },
    });
    return {
      success: true,
      message: `Ensured ${result.total} folders (${result.created} created, ${result.existing} already present).`,
      created: result.created,
      existing: result.existing,
      total: result.total,
      uploadRoot: result.uploadRoot,
    };
  } catch (err) {
    return { success: false, error: formatErrorMessage(err) };
  }
}

export async function scanOrphanCertificateFilesAction(folder?: string): Promise<{
  success: boolean;
  error?: string;
  uploadRoot?: string;
  scanned?: number;
  orphans?: string[];
  deleted?: number;
  dryRun?: boolean;
  errors?: string[];
}> {
  const session = await requireSuperAdmin();
  if (!session) return { success: false, error: 'Unauthorized. Super Admin only.' };

  try {
    const result = await cleanupOrphanCertificateFiles({
      dryRun: true,
      folder: folder?.trim() || null,
    });
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: formatErrorMessage(err) };
  }
}

export async function deleteOrphanCertificateFilesAction(folder?: string): Promise<{
  success: boolean;
  error?: string;
  message?: string;
  uploadRoot?: string;
  scanned?: number;
  orphans?: string[];
  deleted?: number;
  dryRun?: boolean;
  errors?: string[];
}> {
  const session = await requireSuperAdmin();
  if (!session) return { success: false, error: 'Unauthorized. Super Admin only.' };

  try {
    const result = await cleanupOrphanCertificateFiles({
      dryRun: false,
      folder: folder?.trim() || null,
    });

    const admin = createAdminClient();
    await writeActivityLog(admin, {
      user_id: session.userId,
      action: 'SUPER_ORPHAN_CLEANUP',
      entity_type: 'storage',
      entity_id: null,
      description: `Super Admin deleted ${result.deleted} orphan certificate file(s)`,
      metadata: {
        folder: folder?.trim() || null,
        deleted: result.deleted,
        scanned: result.scanned,
        orphan_count: result.orphans.length,
      },
    });

    return {
      success: true,
      message: `Deleted ${result.deleted} orphan file(s). Database rows were not changed.`,
      ...result,
    };
  } catch (err) {
    return { success: false, error: formatErrorMessage(err) };
  }
}
