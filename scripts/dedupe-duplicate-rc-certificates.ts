/**
 * Remove duplicate RC certificates for the same client + substance + calendar year.
 * Keeps the best certificate in each duplicate group and deletes the rest.
 *
 * Usage:
 *   npx tsx scripts/dedupe-duplicate-rc-certificates.ts --dry-run
 *   npx tsx scripts/dedupe-duplicate-rc-certificates.ts
 *   npx tsx scripts/dedupe-duplicate-rc-certificates.ts --client-id=<uuid>
 */
import fs from 'fs/promises';
import path from 'path';
import { createAdminClient } from '../lib/db/admin';
import { normalizeCasNumber } from '../lib/client-directory-import';
import {
  getReachCertificateYear,
  isReachCertificateType,
  type ReachCertificateRecord,
} from '../lib/reach-certificate';
import { CERTIFICATES_BUCKET } from '../lib/storage';
import { extractStorageRelativePath } from '../lib/storage-paths';

const dryRun = process.argv.includes('--dry-run');
const clientIdArg = process.argv.find((arg) => arg.startsWith('--client-id='));
const filterClientId = clientIdArg?.split('=')[1]?.trim() || null;
const UPLOAD_ROOT = path.join(process.cwd(), 'public', 'uploads', 'certificates');

type RcCertRow = ReachCertificateRecord & {
  client_id: string;
  file_url?: string | null;
  allocated_quantity?: number | null;
  tonnage_band?: string | null;
  chemicals?: { chemical_name?: string | null; cas_number?: string | null } | null;
};

function substanceKey(cert: RcCertRow): string {
  const cas = normalizeCasNumber(cert.chemicals?.cas_number || '').toLowerCase();
  const name = String(cert.chemicals?.chemical_name || '').trim().toLowerCase();
  return cas || name || cert.chemical_id || 'unknown';
}

function keeperScore(cert: RcCertRow): number {
  let score = 0;
  if (cert.status === 'active') score += 100;
  else if (cert.status === 'expired') score += 50;
  if (cert.file_url?.trim()) score += 10;
  if (Number(cert.allocated_quantity ?? 0) > 0) score += 5;
  score += new Date(cert.issued_at).getTime() / 1_000_000_000_000;
  return score;
}

function pickKeeper(certs: RcCertRow[]): RcCertRow {
  return [...certs].sort((a, b) => keeperScore(b) - keeperScore(a))[0];
}

async function removeLocalFile(relativePath: string): Promise<void> {
  const fullPath = path.join(UPLOAD_ROOT, ...relativePath.split('/').filter(Boolean));
  try {
    await fs.unlink(fullPath);
    console.log(`  removed file: ${relativePath}`);
  } catch {
    // File may already be missing.
  }
}

async function syncClientChemicalReachFields(
  adminSupabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  chemicalId: string
) {
  const { data: remainingRaw } = await adminSupabase
    .from('certificates')
    .select('id, certificate_number, registration_number, issued_at, expires_at, type, status')
    .eq('client_id', clientId)
    .eq('chemical_id', chemicalId)
    .neq('status', 'revoked')
    .order('issued_at', { ascending: false });

  const latest = (remainingRaw || []).filter(isReachCertificateType)[0] ?? null;
  const toDateOnly = (value: string | null | undefined) =>
    value ? value.split('T')[0] : null;

  if (!latest) {
    await adminSupabase
      .from('client_chemicals')
      .delete()
      .eq('client_id', clientId)
      .eq('chemical_id', chemicalId);
    return;
  }

  await adminSupabase
    .from('client_chemicals')
    .update({
      certificate_number: latest.certificate_number?.trim() || null,
      registration_number: latest.registration_number?.trim() || null,
      issued_date: toDateOnly(latest.issued_at),
      validity_date: toDateOnly(latest.expires_at),
    })
    .eq('client_id', clientId)
    .eq('chemical_id', chemicalId);
}

async function main() {
  const adminSupabase = createAdminClient();

  let query = adminSupabase
    .from('certificates')
    .select(
      'id, client_id, chemical_id, certificate_number, registration_number, issued_at, expires_at, status, type, file_url, allocated_quantity, tonnage_band, chemicals(chemical_name, cas_number)'
    )
    .neq('status', 'revoked')
    .order('issued_at', { ascending: false });

  if (filterClientId) {
    query = query.eq('client_id', filterClientId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const reachCerts = ((data || []) as RcCertRow[]).filter(isReachCertificateType);
  const groups = new Map<string, RcCertRow[]>();

  for (const cert of reachCerts) {
    const year = getReachCertificateYear(cert.issued_at);
    if (year == null) continue;
    const key = `${cert.client_id}:${substanceKey(cert)}:${year}`;
    const bucket = groups.get(key) || [];
    bucket.push(cert);
    groups.set(key, bucket);
  }

  const duplicateGroups = [...groups.entries()].filter(([, certs]) => certs.length > 1);
  if (duplicateGroups.length === 0) {
    console.log('No duplicate RC certificates found.');
    return;
  }

  console.log(
    `${dryRun ? '[dry-run] ' : ''}Found ${duplicateGroups.length} duplicate RC year group(s).`
  );

  let deletedCount = 0;
  const syncedPairs = new Set<string>();

  for (const [groupKey, certs] of duplicateGroups) {
    const keeper = pickKeeper(certs);
    const duplicates = certs.filter((cert) => cert.id !== keeper.id);
    const label = `${groupKey} (keep ${keeper.certificate_number})`;

    console.log(`\n${label}`);
    for (const dup of duplicates) {
      console.log(`  delete ${dup.certificate_number} (${dup.id})`);
      if (dryRun) {
        deletedCount += 1;
        continue;
      }

      await adminSupabase
        .from('tcc_applications')
        .update({ reach_certificate_id: keeper.id })
        .eq('reach_certificate_id', dup.id);

      const storageFiles = [`${dup.certificate_number}.pdf`, `${dup.certificate_number}.docx`];
      await adminSupabase.storage.from(CERTIFICATES_BUCKET).remove(storageFiles);

      if (dup.file_url) {
        const relative = extractStorageRelativePath(dup.file_url);
        if (relative) await removeLocalFile(relative);
      }

      const { error: deleteError } = await adminSupabase
        .from('certificates')
        .delete()
        .eq('id', dup.id);

      if (deleteError) throw deleteError;
      deletedCount += 1;

      const syncKey = `${dup.client_id}:${dup.chemical_id}`;
      if (dup.chemical_id && !syncedPairs.has(syncKey)) {
        await syncClientChemicalReachFields(adminSupabase, dup.client_id, dup.chemical_id);
        syncedPairs.add(syncKey);
      }
    }

    const keeperSyncKey = `${keeper.client_id}:${keeper.chemical_id}`;
    if (!dryRun && keeper.chemical_id && !syncedPairs.has(keeperSyncKey)) {
      await syncClientChemicalReachFields(adminSupabase, keeper.client_id, keeper.chemical_id);
      syncedPairs.add(keeperSyncKey);
    }
  }

  console.log(
    `\n${dryRun ? '[dry-run] Would remove' : 'Removed'} ${deletedCount} duplicate RC certificate(s).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
