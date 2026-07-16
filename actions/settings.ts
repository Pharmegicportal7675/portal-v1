'use server';

import { createAdminClient } from '@/lib/db/admin';
import { getSession } from '@/lib/auth/session';
import { hashPassword } from '@/lib/auth/password';
import { writeActivityLog } from '@/lib/activity-log';
import { revalidatePath } from 'next/cache';
import { validateTccNotificationEmails } from '@/lib/tcc-application-notification';

async function requireAdmin() {
  const session = await getSession();
  if (!session || (session.role !== 'MASTER_ADMIN' && session.role !== 'SUPER_ADMIN')) return null;
  return session;
}

// ============================================================================
// GET ADMIN SETTINGS
// ============================================================================
export async function getAdminSettingsAction() {
  const session = await requireAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const adminSupabase = createAdminClient();
  try {
    const { data: settings, error } = await adminSupabase
      .from('admin_settings')
      .select('*')
      .eq('id', 1)
      .single();

    if (error) {
      const { data: inserted, error: insertError } = await adminSupabase
        .from('admin_settings')
        .insert({ id: 1, email: session.email })
        .select()
        .single();
      if (insertError) throw insertError;
      return { success: true, settings: inserted };
    }

    return { success: true, settings };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

// ============================================================================
// UPDATE PROFILE SETTINGS
// ============================================================================
export async function updateAdminProfileSettingsAction(profileData: {
  full_name?: string;
  mobile_number?: string;
  timezone?: string;
  cc_emails?: string;
  bcc_emails?: string;
  profile_image?: string | null;
}) {
  const session = await requireAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const adminSupabase = createAdminClient();
  try {
    const { error } = await adminSupabase
      .from('admin_settings')
      .upsert({ id: 1, ...profileData, updated_at: new Date().toISOString() }, { onConflict: 'id' });

    if (error) throw error;

    await writeActivityLog(adminSupabase, {
      user_id: session.userId,
      action: 'ADMIN_PROFILE_UPDATED',
      entity_type: 'admin_settings',
      entity_id: '1',
      description: 'Admin profile settings updated',
      metadata: {
        fields: Object.keys(profileData).filter((k) => profileData[k as keyof typeof profileData] !== undefined),
      },
    });

    revalidatePath('/admin/settings');
    revalidatePath('/admin/activity-logs');
    return { success: true, message: 'Profile settings updated successfully.' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

type SmtpFormPayload = {
  smtp_host?: string;
  smtp_port?: number;
  smtp_user?: string;
  smtp_pass?: string;
  smtp_from?: string;
  smtp_cc_default?: string;
};

// ============================================================================
// UPDATE TCC SMTP SETTINGS
// ============================================================================
export async function updateTccSmtpSettingsAction(smtpData: SmtpFormPayload) {
  const session = await requireAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const adminSupabase = createAdminClient();
  try {
    const { error } = await adminSupabase
      .from('admin_settings')
      .upsert({ id: 1, ...smtpData, updated_at: new Date().toISOString() }, { onConflict: 'id' });

    if (error) throw error;

    await writeActivityLog(adminSupabase, {
      user_id: session.userId,
      action: 'SMTP_SETTINGS_UPDATED',
      entity_type: 'admin_settings',
      entity_id: '1',
      description: 'TCC certificate SMTP settings updated',
      metadata: { channel: 'tcc', host: smtpData.smtp_host, from: smtpData.smtp_from },
    });

    revalidatePath('/admin/settings');
    revalidatePath('/admin/activity-logs');
    return { success: true, message: 'TCC certificate SMTP settings saved.' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

// ============================================================================
// UPDATE RC (REACH) SMTP SETTINGS
// ============================================================================
export async function updateRcSmtpSettingsAction(smtpData: SmtpFormPayload) {
  const session = await requireAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const adminSupabase = createAdminClient();
  try {
    const { error } = await adminSupabase
      .from('admin_settings')
      .upsert(
        {
          id: 1,
          rc_smtp_host: smtpData.smtp_host,
          rc_smtp_port: smtpData.smtp_port,
          rc_smtp_user: smtpData.smtp_user,
          rc_smtp_pass: smtpData.smtp_pass,
          rc_smtp_from: smtpData.smtp_from,
          rc_smtp_cc_default: smtpData.smtp_cc_default,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

    if (error) throw error;

    await writeActivityLog(adminSupabase, {
      user_id: session.userId,
      action: 'SMTP_SETTINGS_UPDATED',
      entity_type: 'admin_settings',
      entity_id: '1',
      description: 'CT certificate SMTP settings updated',
      metadata: { channel: 'rc', host: smtpData.smtp_host, from: smtpData.smtp_from },
    });

    revalidatePath('/admin/settings');
    revalidatePath('/admin/activity-logs');
    return { success: true, message: 'CT certificate SMTP settings saved.' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

// ============================================================================
// UPDATE TCC APPLICATION NOTIFICATION EMAILS
// ============================================================================
export async function updateTccNotificationEmailsAction(data: {
  tcc_application_notification_emails?: string;
}) {
  const session = await requireAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const validationError = validateTccNotificationEmails(data.tcc_application_notification_emails);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const adminSupabase = createAdminClient();
  try {
    const { error } = await adminSupabase
      .from('admin_settings')
      .upsert(
        {
          id: 1,
          tcc_application_notification_emails:
            data.tcc_application_notification_emails?.trim() || '',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

    if (error) throw error;

    await writeActivityLog(adminSupabase, {
      user_id: session.userId,
      action: 'NOTIFICATION_EMAILS_UPDATED',
      entity_type: 'admin_settings',
      entity_id: '1',
      description: 'TCC application notification emails updated',
      metadata: {
        emails: data.tcc_application_notification_emails?.trim() || '',
      },
    });

    revalidatePath('/admin/settings');
    revalidatePath('/admin/activity-logs');
    return { success: true, message: 'TCC application notification emails saved.' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

// ============================================================================
// UPDATE ADMIN AUTH (email + password via custom auth)
// ============================================================================
export async function updateAdminAuthAction(data: { email?: string; password?: string }) {
  const session = await requireAdmin();
  if (!session) return { success: false, error: 'Unauthorized.' };

  const adminSupabase = createAdminClient();
  try {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (data.email) {
      const emailLower = data.email.toLowerCase();
      // Check email not taken
      const { data: existing } = await adminSupabase
        .from('users')
        .select('id')
        .eq('email', emailLower)
        .neq('id', session.userId)
        .maybeSingle();
      if (existing) return { success: false, error: 'Email already in use.' };
      updates.email = emailLower;
    }

    if (data.password) {
      if (data.password.length < 6) return { success: false, error: 'Password must be at least 6 characters.' };
      updates.password_hash = await hashPassword(data.password);
      updates.login_password = data.password;
    }

    const { error } = await adminSupabase
      .from('users')
      .update(updates)
      .eq('id', session.userId);

    if (error) throw error;

    const changed: string[] = [];
    if (data.email) changed.push('email');
    if (data.password) changed.push('password');

    await writeActivityLog(adminSupabase, {
      user_id: session.userId,
      action: data.email && data.password
        ? 'ADMIN_AUTH_UPDATED'
        : data.email
          ? 'ADMIN_EMAIL_CHANGED'
          : 'ADMIN_PASSWORD_CHANGED',
      entity_type: 'users',
      entity_id: session.userId,
      description: data.email
        ? `Admin credentials updated (${changed.join(', ')}): ${data.email.toLowerCase()}`
        : 'Admin password changed',
      metadata: {
        email_changed: Boolean(data.email),
        password_changed: Boolean(data.password),
        ...(data.email ? { new_email: data.email.toLowerCase() } : {}),
      },
    });

    revalidatePath('/admin/activity-logs');
    return { success: true, message: 'Credentials updated. Please log in again if you changed your email.' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
