import { ClientProfileView } from './ClientProfileView';

export const revalidate = 0;

export default function ViewClientPage() {
  return <ClientProfileView viewMode="overview" />;
}
