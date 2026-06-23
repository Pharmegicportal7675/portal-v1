export type AppRole = 'SUPER_ADMIN' | 'MASTER_ADMIN' | 'CLIENT';

export function canManageAdminRecords(role?: string | null): boolean {
  return role === 'MASTER_ADMIN' || role === 'SUPER_ADMIN';
}
