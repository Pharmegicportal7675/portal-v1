'use server';

import { createAdminClient } from '@/lib/db/admin';
import { getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';
import type { RcTemplateKey, TccTemplateKey } from '@/lib/certificate-template-config';

export async function updateTemplateAction(
  templateId: string,
  data: {
    logo?: string | null;
    signature_image?: string | null;
    accent_color?: string;
    footer_text?: string | null;
    rc_template_key?: RcTemplateKey;
    tcc_template_key?: TccTemplateKey;
    rc_logo?: string | null;
    rc_signature_image?: string | null;
    rc_accent_color?: string;
    rc_footer_text?: string | null;
    tcc_logo?: string | null;
    tcc_signature_image?: string | null;
    tcc_accent_color?: string;
    tcc_footer_text?: string | null;
  }
) {
  const session = await getSession();
  if (!session || (session.role !== 'MASTER_ADMIN' && session.role !== 'SUPER_ADMIN')) {
    return { success: false, error: 'Unauthorized.' };
  }

  const adminSupabase = createAdminClient();
  try {
    const { error } = await adminSupabase.from('templates').update(data).eq('id', templateId);
    if (error) throw error;
    revalidatePath('/admin/settings');
    return { success: true, message: 'Certificate template updated successfully.' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
