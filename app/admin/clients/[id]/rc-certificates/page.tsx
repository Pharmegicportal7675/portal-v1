import { redirect } from 'next/navigation';

export default async function ClientRcCertificatesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/clients/${id}`);
}
