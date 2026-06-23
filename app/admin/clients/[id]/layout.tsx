import { loadClientProfileData } from './load-client-data';
import { ClientProfileProvider } from './client-profile-context';

export default async function ClientProfileLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await loadClientProfileData(id);

  return <ClientProfileProvider value={data}>{children}</ClientProfileProvider>;
}
