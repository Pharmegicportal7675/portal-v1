const ACTION_LABELS: Record<string, string> = {
  CLIENT_CREATED: 'Client created',
  CLIENT_UPDATED: 'Client profile updated',
  CLIENT_DELETED: 'Client deleted',
  CONTACT_ADDED: 'Secondary contact added',
  CONTACT_UPDATED: 'Secondary contact updated',
  CONTACT_DELETED: 'Secondary contact removed',
  INTERNAL_NOTE_ADDED: 'Internal note added',
  INTERNAL_NOTE_DELETED: 'Internal note deleted',
  USER_LOGIN: 'User logged in',
  USER_LOGOUT: 'User logged out',
  USER_LOGIN_FAILED: 'Login failed',
  EMAIL_CHANGED: 'Client email changed',
  PASSWORD_CHANGED: 'Client password changed',
  LOGIN_DISABLED: 'Client login disabled',
  LOGIN_ENABLED: 'Client login enabled',
  CHEMICAL_ASSIGNED: 'Substance assigned to client',
  CHEMICAL_EDITED: 'Substance updated',
  CHEMICAL_TRASHED: 'Substance moved to trash',
  CHEMICAL_RESTORED: 'Substance restored',
  CHEMICAL_PERMANENTLY_DELETED: 'Substance permanently deleted',
  GLOBAL_CHEMICAL_CREATED: 'Global substance created',
  GLOBAL_CHEMICAL_UPDATED: 'Global substance updated',
  GLOBAL_CHEMICAL_TRASHED: 'Global substance moved to trash',
  GLOBAL_CHEMICAL_RESTORED: 'Global substance restored',
  GLOBAL_CHEMICAL_PERMANENTLY_DELETED: 'Global substance permanently deleted',
  REACH_CERTIFICATE_ISSUED: 'CT certificate issued',
  REACH_CERTIFICATE_RENEWED: 'CT certificate renewed',
  REACH_CERTIFICATE_UPDATED: 'CT certificate updated',
  REACH_CERTIFICATE_DELETED: 'CT certificate deleted',
  REACH_CERTIFICATE_EMAIL_SENT: 'CT certificate email sent',
  REACH_CERTIFICATE_EMAIL_RESENT: 'CT certificate email resent',
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
  MASTER_ADMIN_DISABLED: 'Master admin login disabled',
  MASTER_ADMIN_ENABLED: 'Master admin login enabled',
  MASTER_ADMIN_PASSWORD_RESET: 'Master admin password reset',
  ADMIN_PROFILE_UPDATED: 'Admin profile updated',
  ADMIN_AUTH_UPDATED: 'Admin credentials updated',
  ADMIN_EMAIL_CHANGED: 'Admin email changed',
  ADMIN_PASSWORD_CHANGED: 'Admin password changed',
  SMTP_SETTINGS_UPDATED: 'SMTP settings updated',
  NOTIFICATION_EMAILS_UPDATED: 'Notification emails updated',
  TEMPLATE_UPDATED: 'Certificate template updated',
  CLIENTS_IMPORTED: 'Clients imported from Excel',
  CLIENTS_EXPORTED: 'Clients exported to Excel',
  USER_MANUAL_UPLOADED: 'User manual uploaded',
  USER_MANUAL_DELETED: 'User manual removed',
  USER_GUIDE_URL_UPDATED: 'User Guide URL updated',
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
