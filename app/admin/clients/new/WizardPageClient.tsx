'use client';

import { useRouter } from 'next/navigation';
import ClientWizard from '@/components/ClientWizard';

export default function WizardPageClient() {
  const router = useRouter();

  return (
    <ClientWizard
      onSuccess={() => {
        router.push('/admin/clients');
        router.refresh();
      }}
      onCancel={() => {
        router.push('/admin/clients');
      }}
    />
  );
}