const ACTION_LABELS: Record<string, string> = {
  CLIENT_CREATED: 'Client created',
  CLIENT_UPDATED: 'Client profile updated',
  EMAIL_CHANGED: 'Client email changed',
  PASSWORD_CHANGED: 'Client password changed',
  LOGIN_DISABLED: 'Client login disabled',
  LOGIN_ENABLED: 'Client login enabled',
  CHEMICAL_ASSIGNED: 'Substance assigned to client',
  CHEMICAL_EDITED: 'Substance updated',
  CHEMICAL_TRASHED: 'Substance moved to trash',
  CHEMICAL_RESTORED: 'Substance restored',
  CHEMICAL_PERMANENTLY_DELETED: 'Substance permanently deleted',
  REACH_CERTIFICATE_ISSUED: 'RC certificate issued',
  REACH_CERTIFICATE_RENEWED: 'RC certificate renewed',
  REACH_CERTIFICATE_UPDATED: 'RC certificate updated',
  REACH_CERTIFICATE_DELETED: 'RC certificate deleted',
  REACH_CERTIFICATE_EMAIL_SENT: 'RC certificate email sent',
  REACH_CERTIFICATE_EMAIL_RESENT: 'RC certificate email resent',
  CREATE_TCC_APPLICATION: 'TCC application submitted',
  UPDATE_TCC_APPLICATION: 'TCC application updated',
  TCC_ADMIN_EDIT: 'TCC application edited (admin)',
  TCC_APPROVED: 'TCC approved & certificate issued',
  TCC_REJECTED: 'TCC application rejected',
  TCC_CHANGES_REQUIRED: 'TCC changes requested',
  TCC_APPLICATION_DELETED: 'TCC application deleted',
  CERTIFICATE_EMAIL_SENT: 'Certificate email sent',
  CERTIFICATE_EMAIL_RESENT: 'Certificate email resent',
  CREATE_MASTER_ADMIN: 'Master admin created',
  REMOVE_MASTER_ADMIN: 'Master admin removed',
};

export function formatActivityLogAction(action: string): string {
  const trimmed = action?.trim();
  if (!trimmed) return 'Unknown activity';
  return ACTION_LABELS[trimmed] || trimmed.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatActivityLogRole(role: string | null | undefined): string {
  if (!role) return 'System';
  switch (role) {
    case 'SUPER_ADMIN':
      return 'Super Admin';
    case 'MASTER_ADMIN':
      return 'Master Admin';
    case 'CLIENT':
      return 'Client';
    default:
      return role.replace(/_/g, ' ');
  }
}
