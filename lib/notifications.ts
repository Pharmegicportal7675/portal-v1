import type { DbClient } from '@/lib/db/types';
import { formatActivityLogAction } from '@/lib/activity-log-labels';

export type NotificationRow = {
  id: string;
  title: string;
  message: string;
  link?: string | null;
  read: boolean;
  created_at: string;
};

export const NEW_TCC_APPLICATION_TITLE = 'New TCC application';
export const UPDATED_TCC_APPLICATION_TITLE = 'TCC application updated';

export const TCC_REVIEW_NOTIFICATION_TITLES = [
  NEW_TCC_APPLICATION_TITLE,
  UPDATED_TCC_APPLICATION_TITLE,
] as const;

export function formatNotificationQuantity(value: unknown): string {
  const raw = value == null ? '' : String(value).trim();
  const numeric = Number(raw);
  if (!raw || !Number.isFinite(numeric)) return raw || '0';
  return String(numeric);
}

export function newTccApplicationMessage(
  companyName: string,
  quantity: unknown,
  chemicalName: string
) {
  const company = companyName.trim() || 'A client';
  return `${company} submitted ${formatNotificationQuantity(quantity)} MT for ${chemicalName}. Review in Approvals.`;
}

export function updatedTccApplicationMessage(
  companyName: string,
  quantity: unknown,
  chemicalName: string
) {
  const company = companyName.trim() || 'A client';
  return `${company} updated a TCC request: ${formatNotificationQuantity(quantity)} MT for ${chemicalName}. Review in Approvals.`;
}

export function newTccApplicationLink(applicationId: string) {
  return `/admin/approvals?app=${encodeURIComponent(applicationId)}`;
}

export async function notifyUser(
  supabase: DbClient,
  userId: string,
  title: string,
  message: string,
  link?: string | null
) {
  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    title,
    message,
    link: link?.trim() || null,
    read: false,
  });
  if (error) throw error;
}

export async function notifyAllAdmins(
  supabase: DbClient,
  title: string,
  message: string,
  link?: string | null
) {
  const { data: admins, error: fetchErr } = await supabase
    .from('users')
    .select('id')
    .in('role', ['MASTER_ADMIN', 'SUPER_ADMIN']);

  if (fetchErr) throw fetchErr;
  if (!admins?.length) return;

  const rows = admins.map((a: any) => ({
    user_id: a.id,
    title,
    message,
    link: link?.trim() || null,
    read: false,
  }));

  const { error } = await supabase.from('notifications').insert(rows);
  if (error) throw error;
}

const SILENT_ACTIVITY_ACTIONS = new Set([
  'USER_LOGIN',
  'USER_LOGOUT',
  'USER_LOGIN_FAILED',
  'CLIENTS_EXPORTED',
]);

/** Admin-only work. The client company must not see these alerts. */
const ADMIN_ONLY_ACTIVITY_ACTIONS = new Set([
  'INTERNAL_NOTE_ADDED',
  'INTERNAL_NOTE_DELETED',
  'CLIENTS_IMPORTED',
  'SMTP_SETTINGS_UPDATED',
  'NOTIFICATION_EMAILS_UPDATED',
  'ADMIN_PROFILE_UPDATED',
  'ADMIN_AUTH_UPDATED',
  'ADMIN_EMAIL_CHANGED',
  'ADMIN_PASSWORD_CHANGED',
  'TEMPLATE_UPDATED',
  'CREATE_MASTER_ADMIN',
  'REMOVE_MASTER_ADMIN',
  'MASTER_ADMIN_DISABLED',
  'MASTER_ADMIN_ENABLED',
  'MASTER_ADMIN_PASSWORD_RESET',
  'USER_MANUAL_UPLOADED',
  'USER_MANUAL_DELETED',
  'USER_GUIDE_URL_UPDATED',
  'SUPER_PO_UPLOAD',
  'SUPER_CERT_REGEN',
  'SUPER_ORPHAN_CLEANUP',
  'SUPER_ENSURE_FOLDERS',
]);

function activityNotificationTitle(action: string) {
  if (action === 'CREATE_TCC_APPLICATION') return NEW_TCC_APPLICATION_TITLE;
  if (action === 'UPDATE_TCC_APPLICATION' || action === 'TCC_ADMIN_EDIT') return UPDATED_TCC_APPLICATION_TITLE;
  return formatActivityLogAction(action);
}

function activityNotificationLinks(action: string, clientId?: string | null, entityId?: string | null) {
  const clientPage = clientId ? `/admin/clients/${clientId}` : '/admin/clients';
  const approvalLink = entityId
    ? `/admin/approvals?app=${encodeURIComponent(entityId)}`
    : '/admin/approvals';

  switch (action) {
    case 'CREATE_TCC_APPLICATION':
    case 'UPDATE_TCC_APPLICATION':
    case 'TCC_ADMIN_EDIT':
    case 'TCC_REJECTED':
    case 'TCC_CHANGES_REQUIRED':
      return { admin: approvalLink, client: '/client' };
    case 'TCC_APPROVED':
    case 'CERTIFICATE_EMAIL_SENT':
    case 'CERTIFICATE_EMAIL_RESENT':
      return {
        admin: clientId ? `/admin/clients/${clientId}/certificates` : '/admin/approvals',
        client: '/client/certificates',
      };
    case 'TCC_FRAMEWORK_NOTIFICATION':
      return { admin: '/admin/rc-certificates', client: '/client' };
    case 'TCC_APPLICATION_DELETED':
      return { admin: '/admin/approvals', client: '/client' };
    case 'REACH_CERTIFICATE_ISSUED':
    case 'REACH_CERTIFICATE_RENEWED':
    case 'REACH_CERTIFICATE_UPDATED':
    case 'REACH_CERTIFICATE_DELETED':
    case 'REACH_CERTIFICATE_EMAIL_SENT':
    case 'REACH_CERTIFICATE_EMAIL_RESENT':
      return {
        admin: clientId ? `/admin/clients/${clientId}/rc-certificates` : '/admin/rc-certificates',
        client: '/client',
      };
    case 'CLIENT_DELETED':
    case 'CLIENTS_IMPORTED':
      return { admin: '/admin/clients', client: '/client' };
    case 'CREATE_MASTER_ADMIN':
    case 'REMOVE_MASTER_ADMIN':
    case 'MASTER_ADMIN_DISABLED':
    case 'MASTER_ADMIN_ENABLED':
    case 'MASTER_ADMIN_PASSWORD_RESET':
      return { admin: '/admin/super', client: '/client' };
    case 'TEMPLATE_UPDATED':
      return { admin: '/admin/templates', client: '/client' };
    case 'ADMIN_PROFILE_UPDATED':
    case 'ADMIN_AUTH_UPDATED':
    case 'ADMIN_EMAIL_CHANGED':
    case 'ADMIN_PASSWORD_CHANGED':
    case 'SMTP_SETTINGS_UPDATED':
    case 'NOTIFICATION_EMAILS_UPDATED':
      return { admin: '/admin/settings', client: '/client' };
    default:
      return { admin: clientPage, client: '/client' };
  }
}

/** Tell every admin, and the affected client logins, that something changed. */
export async function notifyPortalActivity(
  supabase: DbClient,
  entry: {
    action: string;
    description: string;
    client_id?: string | null;
    entity_id?: string | null;
  }
) {
  if (SILENT_ACTIVITY_ACTIONS.has(entry.action)) return;

  const title = activityNotificationTitle(entry.action);
  const message = entry.description.trim().slice(0, 2000) || title;
  const links = activityNotificationLinks(entry.action, entry.client_id, entry.entity_id);
  const showClient = Boolean(entry.client_id) && !ADMIN_ONLY_ACTIVITY_ACTIONS.has(entry.action);

  const [{ data: admins, error: adminError }, clientResult] = await Promise.all([
    supabase.from('users').select('id').in('role', ['MASTER_ADMIN', 'SUPER_ADMIN']),
    showClient
      ? supabase.from('users').select('id').eq('client_id', entry.client_id).eq('role', 'CLIENT')
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (adminError) throw adminError;
  if (clientResult.error) throw clientResult.error;

  const rows: { user_id: string; title: string; message: string; link: string; read: boolean }[] = [];
  const seen = new Set<string>();

  for (const admin of admins || []) {
    if (!admin?.id || seen.has(admin.id)) continue;
    seen.add(admin.id);
    rows.push({ user_id: admin.id, title, message, link: links.admin, read: false });
  }

  for (const clientUser of clientResult.data || []) {
    if (!clientUser?.id || seen.has(clientUser.id)) continue;
    seen.add(clientUser.id);
    rows.push({ user_id: clientUser.id, title, message, link: links.client, read: false });
  }

  if (rows.length === 0) return;

  const { error } = await supabase.from('notifications').insert(rows);
  if (error) throw error;
}
