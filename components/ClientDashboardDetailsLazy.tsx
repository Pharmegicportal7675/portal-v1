'use client';

import dynamic from 'next/dynamic';
import ClientDashboardSkeleton from '@/components/ClientDashboardSkeleton';

const ClientDashboardDetails = dynamic(
  () => import('@/app/admin/clients/[id]/ClientDashboardDetails'),
  { loading: () => <ClientDashboardSkeleton /> }
);

export default ClientDashboardDetails;
