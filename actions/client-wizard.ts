'use server';

import { createAdminClient } from '@/lib/db/admin';
import { getSession } from '@/lib/auth/session';
import { hashPassword } from '@/lib/auth/password';
import { formatErrorMessage } from '@/lib/format-error';
import { clientWizardSchema, clientWizardEditSchema } from '@/lib/validations';
import { revalidatePath } from 'next/cache';

async function requireAdmin() {
  const session = await getSession();
  if (!session || (session.role !== 'MASTER_ADMIN' && session.role !== 'SUPER_ADMIN')) {
    return null;
  }
  return session;
}

function optionalText(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

type ClientProfileInput = {
  company_name: string;
  uuid_number: string;
  primary_contact_first_name: string;
  primary_contact_last_name: string;
  email: string;
  owner_name?: string;
  phone?: string;
  cc_emails?: string;
  cc_phones?: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postal_code: string;
  status: 'active' | 'inactive' | 'pending';
  regulatory_registrations: string[];
};

function buildClientUpdateData(profile: ClientProfileInput) {
  return {
    company_name: profile.company_name.trim(),
    uuid_number: profile.uuid_number.trim(),
    primary_contact_first_name: profile.primary_contact_first_name.trim(),
    primary_contact_last_name: profile.primary_contact_last_name.trim(),
    email: profile.email.toLowerCase(),
    owner_name: optionalText(profile.owner_name),
    phone: optionalText(profile.phone),
    cc_emails: optionalText(profile.cc_emails),
    cc_phones: optionalText(profile.cc_phones),
    address: profile.address.trim(),
    city: profile.city.trim(),
    state: profile.state.trim(),
    country: profile.country.trim(),
    postal_code: profile.postal_code.trim(),
    status: profile.status,
    regulatory_registrations: profile.regulatory_registrations,
    updated_at: new Date(),
  };
}

export async function createClientAction(prevState: unknown, data: unknown) {
  try {
    const session = await requireAdmin();
    if (!session) return { success: false, error: 'Unauthorized. Admins only.' };

    const parsed = clientWizardSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const adminSupabase = createAdminClient();
    const { profile, contacts } = parsed.data;

    const { data: existing } = await adminSupabase
      .from('clients')
      .select('id')
      .eq('email', profile.email.toLowerCase())
      .maybeSingle();
    if (existing) return { success: false, error: 'A client with this email already exists.' };

    const password_hash = await hashPassword(profile.password);

    const { data: client, error: clientError } = await adminSupabase
      .from('clients')
      .insert({
        company_name: profile.company_name,
        legal_name: null,
        registration_number: null,
        uuid_number: profile.uuid_number.trim(),
        owner_name: profile.owner_name || null,
        email: profile.email.toLowerCase(),
        phone: profile.phone || null,
        primary_contact_first_name: profile.primary_contact_first_name,
        primary_contact_last_name: profile.primary_contact_last_name,
        cc_emails: profile.cc_emails || null,
        cc_phones: profile.cc_phones || null,
        address: profile.address.trim(),
        city: profile.city.trim(),
        state: profile.state.trim(),
        country: profile.country.trim(),
        postal_code: profile.postal_code.trim(),
        status: profile.status,
        regulatory_registrations: profile.regulatory_registrations,
      })
      .select()
      .single();

    if (clientError || !client) throw clientError || new Error('Failed to create client');

    const { data: user, error: userError } = await adminSupabase
      .from('users')
      .insert({
        email: profile.email.toLowerCase(),
        password_hash,
        login_password: profile.password,
        role: 'CLIENT',
        client_id: client.id,
        is_disabled: false,
      })
      .select()
      .single();

    if (userError || !user) {
      await adminSupabase.from('clients').delete().eq('id', client.id);
      throw userError || new Error('Failed to create user login record');
    }

    if (contacts.length > 0) {
      const contactRows = contacts.map((c) => ({
        client_id: client.id,
        first_name: c.first_name,
        last_name: c.last_name,
        email: c.email,
        phone: c.phone || null,
        role: c.role || null,
      }));
      const { error: contactError } = await adminSupabase.from('client_contacts').insert(contactRows);
      if (contactError) throw contactError;
    }

    const { error: logError } = await adminSupabase.from('activity_logs').insert({
      client_id: client.id,
      user_id: session.userId,
      action: 'CLIENT_CREATED',
      entity_type: 'clients',
      entity_id: client.id,
      description: `Client ${client.company_name} created by admin`,
    });
    if (logError) throw logError;

    revalidatePath('/admin/clients');
    return {
      success: true,
      message: 'Client created and login credentials set successfully.',
      clientId: client.id,
    };
  } catch (err) {
    console.error('[CLIENT CREATE ERROR]:', err);
    return { success: false, error: formatErrorMessage(err) };
  }
}

export async function updateClientWizardAction(clientId: string, data: unknown) {
  try {
    const session = await requireAdmin();
    if (!session) return { success: false, error: 'Unauthorized.' };

    const parsed = clientWizardEditSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const adminSupabase = createAdminClient();
    const { profile, contacts } = parsed.data;
    const email = profile.email.toLowerCase();

    const { data: emailConflict } = await adminSupabase
      .from('clients')
      .select('id')
      .eq('email', email)
      .neq('id', clientId)
      .maybeSingle();
    if (emailConflict) {
      return { success: false, error: 'A client with this email already exists.' };
    }

    const { error: updateError } = await adminSupabase
      .from('clients')
      .update(buildClientUpdateData(profile))
      .eq('id', clientId);
    if (updateError) throw updateError;

    const { data: loginUser } = await adminSupabase
      .from('users')
      .select('id, email')
      .eq('client_id', clientId)
      .maybeSingle();
    if (loginUser && loginUser.email !== email) {
      const { error: userEmailError } = await adminSupabase
        .from('users')
        .update({ email })
        .eq('id', loginUser.id);
      if (userEmailError) throw userEmailError;
    }

    const { error: deleteContactsError } = await adminSupabase
      .from('client_contacts')
      .delete()
      .eq('client_id', clientId);
    if (deleteContactsError) throw deleteContactsError;

    if (contacts.length > 0) {
      const contactRows = contacts.map((contact) => ({
        client_id: clientId,
        first_name: contact.first_name,
        last_name: contact.last_name,
        email: contact.email,
        phone: contact.phone || null,
        role: contact.role || null,
      }));
      const { error: contactError } = await adminSupabase.from('client_contacts').insert(contactRows);
      if (contactError) throw contactError;
    }

    const { error: logError } = await adminSupabase.from('activity_logs').insert({
      client_id: clientId,
      user_id: session.userId,
      action: 'CLIENT_UPDATED',
      entity_type: 'clients',
      entity_id: clientId,
      description: 'Client profile and contacts updated by admin',
    });
    if (logError) throw logError;

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath(`/admin/clients/${clientId}/edit`);
    revalidatePath('/admin/clients');
    return { success: true, message: 'Client profile updated successfully.' };
  } catch (err) {
    console.error('[CLIENT UPDATE ERROR]:', err);
    return { success: false, error: formatErrorMessage(err) };
  }
}
