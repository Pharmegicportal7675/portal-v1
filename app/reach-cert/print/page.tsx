import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadReachHtmlDataFromPrintToken } from '@/lib/reach-certificate-html-pdf-server';
import { verifyReachPrintToken } from '@/lib/reach-certificate-print-token';
import ReachCertificatePrintClient from './ReachCertificatePrintClient';

export const dynamic = 'force-dynamic';

export default async function ReachCertificatePrintPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) notFound();

  const payload = await verifyReachPrintToken(token);
  if (!payload) notFound();

  const adminSupabase = createAdminClient();
  const data = await loadReachHtmlDataFromPrintToken(adminSupabase, payload);
  if (!data) notFound();

  return <ReachCertificatePrintClient data={data} />;
}
