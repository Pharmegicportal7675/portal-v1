'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/db/admin';
import { getSession } from '@/lib/auth/session';
import { formatErrorMessage } from '@/lib/format-error';
import {
  CLIENT_IMPORT_DEFAULT_PASSWORD,
  parseSpreadsheetBuffer,
  buildClientImportTemplateBuffer,
} from '@/lib/client-directory-import';
import { importClientDirectoryRows } from '@/services/client-directory-import';

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

async function requireAdmin() {
  const session = await getSession();
  if (!session || (session.role !== 'MASTER_ADMIN' && session.role !== 'SUPER_ADMIN')) {
    return null;
  }
  return session;
}

function validateFilename(filename: string): string | null {
  const lower = filename.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return 'Only .xlsx, .xls, or .csv files are supported.';
  }
  return null;
}

export async function downloadClientImportTemplateAction() {
  const session = await requireAdmin();
  if (!session) {
    return { success: false as const, error: 'Unauthorized. Admins only.' };
  }

  try {
    const buffer = buildClientImportTemplateBuffer();
    return {
      success: true as const,
      base64: Buffer.from(buffer).toString('base64'),
      filename: 'pharmegic-client-import-template.xlsx',
    };
  } catch (error) {
    return {
      success: false as const,
      error: formatErrorMessage(error) || 'Failed to build import template.',
    };
  }
}

export async function importClientsDirectoryAction(input: {
  base64: string;
  filename: string;
  dryRun?: boolean;
}) {
  const session = await requireAdmin();
  if (!session) {
    return { success: false as const, error: 'Unauthorized. Admins only.' };
  }

  const filenameError = validateFilename(input.filename);
  if (filenameError) {
    return { success: false as const, error: filenameError };
  }

  try {
    const buffer = Buffer.from(input.base64, 'base64');
    if (buffer.byteLength === 0) {
      return { success: false as const, error: 'The uploaded file is empty.' };
    }
    if (buffer.byteLength > MAX_IMPORT_BYTES) {
      return { success: false as const, error: 'File is too large. Maximum size is 10 MB.' };
    }

    const defaultPassword =
      process.env.CLIENT_IMPORT_DEFAULT_PASSWORD || CLIENT_IMPORT_DEFAULT_PASSWORD;

    const parsed = parseSpreadsheetBuffer(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
      defaultPassword
    );

    if (parsed.clients.length === 0 && parsed.contacts.length === 0 && parsed.substances.length === 0) {
      return {
        success: false as const,
        error:
          'No valid rows found. Add Client rows (Company Name + Email) and/or Authorized Substance rows (Company Name + Substance Name + CAS).',
        skippedRows: parsed.skippedRows,
      };
    }

    const adminSupabase = createAdminClient();
    const summary = await importClientDirectoryRows(adminSupabase, {
      clients: parsed.clients,
      contacts: parsed.contacts,
      substances: parsed.substances,
      dryRun: input.dryRun ?? false,
      defaultPassword,
      userId: session.userId,
    });

    if (
      !input.dryRun &&
      (summary.createdClients > 0 ||
        summary.updatedClients > 0 ||
        summary.updatedContacts > 0 ||
        summary.createdSubstances > 0 ||
        summary.updatedSubstances > 0)
    ) {
      revalidatePath('/admin/clients');
      revalidatePath('/admin/rc-certificates');
    }

    return {
      success: true as const,
      dryRun: input.dryRun ?? false,
      summary,
      skippedRows: parsed.skippedRows,
      defaultPasswordUsed: defaultPassword,
    };
  } catch (error) {
    return {
      success: false as const,
      error: formatErrorMessage(error) || 'Failed to import client data.',
    };
  }
}
