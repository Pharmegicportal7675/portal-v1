/**
 * Remove legacy TCC .docx files from local certificate storage and regenerate HTML PDFs.
 *
 * Usage:
 *   npx tsx scripts/cleanup-tcc-docx-storage.ts
 *   npx tsx scripts/cleanup-tcc-docx-storage.ts --dry-run
 *   npx tsx scripts/cleanup-tcc-docx-storage.ts --no-regenerate
 */
import { config } from 'dotenv';
import path from 'path';
import { cleanupLegacyTccDocxStorage } from '../lib/tcc-certificate-storage-cleanup';

config({ path: path.join(process.cwd(), '.env.local') });
config({ path: path.join(process.cwd(), '.env') });

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const regeneratePdfs = !process.argv.includes('--no-regenerate');

  console.log('TCC legacy DOCX cleanup');
  console.log(`  dryRun: ${dryRun}`);
  console.log(`  regeneratePdfs: ${regeneratePdfs}`);
  console.log('');

  const result = await cleanupLegacyTccDocxStorage({ dryRun, regeneratePdfs });

  console.log('Done.');
  console.log(`  TCC certificates: ${result.totalTccCertificates}`);
  console.log(`  DOCX removed:     ${result.docxRemoved}`);
  console.log(`  file_url updated: ${result.fileUrlsUpdated}`);
  console.log(`  PDF regenerated:  ${result.pdfsRegenerated}`);

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
