'use client';

import { createContext, useContext } from 'react';
import type { ClientProfileData } from './load-client-data';

const ClientProfileContext = createContext<ClientProfileData | null>(null);

export function ClientProfileProvider({
  value,
  children,
}: {
  value: ClientProfileData;
  children: React.ReactNode;
}) {
  return <ClientProfileContext.Provider value={value}>{children}</ClientProfileContext.Provider>;
}

export function useClientProfileData(): ClientProfileData {
  const value = useContext(ClientProfileContext);
  if (!value) {
    throw new Error('useClientProfileData must be used within ClientProfileProvider');
  }
  return value;
}
