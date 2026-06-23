import { cache } from 'react';
import { createAdminClient } from '@/lib/db/admin';
import { normalizeRegulatoryRegistrations } from '@/lib/regulatory-registrations';

export const getClientSidebarProfile = cache(async (clientId: string) => {
  const adminSupabase = createAdminClient();
  const { data } = await adminSupabase
    .from('clients')
    .select('company_name, regulatory_registrations')
    .eq('id', clientId)
    .single();

  return {
    companyName: data?.company_name ?? 'Partner Client',
    regulatoryRegistrations: normalizeRegulatoryRegistrations(data?.regulatory_registrations),
  };
});
