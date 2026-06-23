export const CERTIFICATES_BUCKET = 'certificates';

/** Local filesystem storage — bucket always exists under public/uploads/certificates. */
export async function ensureCertificatesBucket(_supabase?: unknown): Promise<void> {
  void _supabase;
  void CERTIFICATES_BUCKET;
}
