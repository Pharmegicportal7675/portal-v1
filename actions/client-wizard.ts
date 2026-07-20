'use server';

import { createClientWizard, updateClientWizard } from '@/services/client-wizard';

export async function createClientAction(_prevState: unknown, data: unknown) {
  return createClientWizard(data);
}

export async function updateClientWizardAction(clientId: string, data: unknown) {
  return updateClientWizard(clientId, data);
}
