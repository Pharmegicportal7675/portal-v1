'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ClientWizard, { type ClientWizardContact, type ClientWizardProfile } from '@/components/ClientWizard';
import { normalizeRegulatoryRegistrations } from '@/lib/regulatory-registrations';
import { useLayoutStore } from '@/store/layout';

interface ClientRecord {
  id: string;
  company_name: string;
  uuid_number: string | null;
  primary_contact_first_name?: string | null;
  primary_contact_last_name?: string | null;
  email: string;
  owner_name: string | null;
  phone: string | null;
  cc_emails: string | null;
  cc_phones: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  status: 'active' | 'inactive' | 'pending';
  regulatory_registrations?: string[] | null;
}

interface ContactRecord {
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  role: string | null;
}

interface EditClientClientProps {
  client: ClientRecord;
  contacts: ContactRecord[];
}

export default function EditClientClient({ client, contacts }: EditClientClientProps) {
  const router = useRouter();
  const setCustomBreadcrumb = useLayoutStore((state) => state.setCustomBreadcrumb);

  useEffect(() => {
    setCustomBreadcrumb(client.company_name);
    return () => setCustomBreadcrumb(null);
  }, [client.company_name, setCustomBreadcrumb]);

  const initialProfile: Partial<ClientWizardProfile> = {
    company_name: client.company_name || '',
    uuid_number: client.uuid_number || '',
    primary_contact_first_name: client.primary_contact_first_name || '',
    primary_contact_last_name: client.primary_contact_last_name || '',
    email: client.email || '',
    owner_name: client.owner_name || '',
    phone: client.phone || '',
    cc_emails: client.cc_emails || '',
    cc_phones: client.cc_phones || '',
    address: client.address || '',
    city: client.city || '',
    state: client.state || '',
    country: client.country || 'India',
    postal_code: client.postal_code || '',
    status: client.status,
  };

  const initialContacts: ClientWizardContact[] = contacts.map((contact) => ({
    first_name: contact.first_name,
    last_name: contact.last_name,
    email: contact.email,
    phone: contact.phone || '',
    role: contact.role || '',
  }));

  return (
    <ClientWizard
      mode="edit"
      clientId={client.id}
      initialProfile={initialProfile}
      initialContacts={initialContacts}
      initialRegistrations={normalizeRegulatoryRegistrations(client.regulatory_registrations)}
      onSuccess={() => {
        router.push(`/admin/clients/${client.id}`);
        router.refresh();
      }}
      onCancel={() => {
        router.push(`/admin/clients/${client.id}`);
      }}
    />
  );
}
