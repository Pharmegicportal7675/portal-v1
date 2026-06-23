import type { SupabaseClient } from '@supabase/supabase-js';

const TCC_CERT_NUMBER_PREFIX = 'TCC';
const MAX_GENERATION_ATTEMPTS = 30;

function buildTccCertificateNumberCandidate(year: number): string {
  const randStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${TCC_CERT_NUMBER_PREFIX}-${year}-${randStr}`;
}

/** Generates a certificate number that is not present in certificates (including revoked). */
export async function generateUniqueTccCertificateNumber(
  supabase: SupabaseClient
): Promise<string> {
  const year = new Date().getFullYear();

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const certNumber = buildTccCertificateNumberCandidate(year);
    const { data } = await supabase
      .from('certificates')
      .select('id')
      .eq('certificate_number', certNumber)
      .maybeSingle();

    if (!data) return certNumber;
  }

  throw new Error('Failed to generate a unique TCC certificate number.');
}
