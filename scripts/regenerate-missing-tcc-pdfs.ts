/**
 * Regenerate TCC certificate PDF files that are missing from disk.
 * SAFE: add-only — never deletes DB rows, applications, or PO attachments.
 * Only writes PDF files (upsert) and updates certificates.file_url when needed.
 *
 * Usage:
 *   npx tsx scripts/regenerate-missing-tcc-pdfs.ts
 *   npx tsx scripts/regenerate-missing-tcc-pdfs.ts --dry-run
 *   npx tsx scripts/regenerate-missing-tcc-pdfs.ts --id=<certificateId>
 */
import { config } from 'dotenv';
import path from 'path';
import { regenerateMissingTccCertificateFiles } from '../lib/regenerate-tcc-certificate-file';

config({ path: path.join(process.cwd(), '.env.local') });
config({ path: path.join(process.cwd(), '.env') });

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const idArg = process.argv.find((arg) => arg.startsWith('--id='));
  const certificateId = idArg?.slice('--id='.length)?.trim() || undefined;

  console.log('Regenerate missing TCC certificate PDFs');
  console.log(`  dryRun: ${dryRun}`);
  if (certificateId) console.log(`  certificateId: ${certificateId}`);
  console.log('');

  const result = await regenerateMissingTccCertificateFiles({ dryRun, certificateId });

  console.log('');
  console.log('Done.');
  console.log(`  TCC certificates: ${result.total}`);
  console.log(`  Missing on disk:  ${result.missing}`);
  console.log(`  Regenerated:      ${result.regenerated}`);

  if (result.errors.length > 0) {
    console.log('\nErrors:');
    for (const line of result.errors) {
      console.log(`  - ${line}`);
    }
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
