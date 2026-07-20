import { createAdminClient } from '@/lib/db/admin';
import { getSession } from '@/lib/auth/session';
import { hashPassword } from '@/lib/auth/password';
import { formatErrorMessage } from '@/lib/format-error';
import { findPortalEmailConflict, findPortalUuidConflict } from '@/lib/portal-email-check';
import { clientWizardSchema, clientWizardEditSchema } from '@/lib/validations';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
import {
  buildActivityFieldChanges,
  CLIENT_PROFILE_FIELD_LABELS,
  CONTACT_FIELD_LABELS,
  formatActivityFieldChangesDescription,
  writeActivityLog,
} from '@/lib/activity-log';
import { normalizeRegulatoryRegistrations } from '@/lib/regulatory-registrations';

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
    company_name: String(profile.company_name ?? '').trim(),
    uuid_number: String(profile.uuid_number ?? '').trim(),
    primary_contact_first_name: String(profile.primary_contact_first_name ?? '').trim(),
    primary_contact_last_name: String(profile.primary_contact_last_name ?? '').trim(),
    email: profile.email.toLowerCase(),
    owner_name: optionalText(profile.owner_name),
    phone: optionalText(profile.phone),
    address: String(profile.address ?? '').trim(),
    city: String(profile.city ?? '').trim(),
    state: String(profile.state ?? '').trim(),
    country: String(profile.country ?? '').trim(),
    postal_code: String(profile.postal_code ?? '').trim(),
    status: profile.status,
    regulatory_registrations: profile.regulatory_registrations,
    updated_at: new Date(),
  };
}

export async function createClientWizard(data: unknown) {
  try {
    const session = await requireAdmin();
    if (!session) return { success: false, error: 'Unauthorized. Admins only.' };

    const parsed = clientWizardSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const adminSupabase = createAdminClient();
    const { profile, contacts } = parsed.data;
    const emailLower = profile.email.toLowerCase();

    const emailConflict = await findPortalEmailConflict(adminSupabase, emailLower);
    if (emailConflict) return { success: false, error: emailConflict };

    const uuidConflict = await findPortalUuidConflict(adminSupabase, profile.uuid_number);
    if (uuidConflict) return { success: false, error: uuidConflict };

    const password_hash = await hashPassword(profile.password);

    const { data: client, error: clientError } = await adminSupabase
      .from('clients')
      .insert({
        company_name: profile.company_name,
        legal_name: null,
        registration_number: null,
        uuid_number: profile.uuid_number.trim(),
        owner_name: profile.owner_name || null,
        email: emailLower,
        phone: profile.phone || null,
        primary_contact_first_name: profile.primary_contact_first_name,
        primary_contact_last_name: profile.primary_contact_last_name,
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

    if (clientError || !client) {
      return {
        success: false,
        error: formatErrorMessage(clientError || new Error('Failed to create client record.')),
      };
    }

    const { data: user, error: userError } = await adminSupabase
      .from('users')
      .insert({
        email: emailLower,
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
      return {
        success: false,
        error: formatErrorMessage(userError || new Error('Failed to create client login credentials.')),
      };
    }

    if (contacts.length > 0) {
      const contactRows = contacts.map((c) => ({
        id: randomUUID(),
        client_id: client.id,
        first_name: c.first_name.trim(),
        last_name: c.last_name.trim(),
        email: c.email.trim().toLowerCase(),
        phone: optionalText(c.phone),
        role: optionalText(c.role),
      }));
      const { error: contactError } = await adminSupabase.from('client_contacts').insert(contactRows);
      if (contactError) throw contactError;
    }

    const contactSummary =
      contacts.length > 0
        ? ` · ${contacts.length} secondary contact${contacts.length === 1 ? '' : 's'} added`
        : '';

    await writeActivityLog(adminSupabase, {
      client_id: client.id,
      user_id: session.userId,
      action: 'CLIENT_CREATED',
      entity_type: 'clients',
      entity_id: client.id,
      description: `Client ${client.company_name} created by admin${contactSummary}`,
      metadata: {
        contacts: contacts.map((c) => ({
          first_name: c.first_name,
          last_name: c.last_name,
          email: c.email,
          phone: c.phone || null,
          role: c.role || null,
        })),
      },
    });

    revalidatePath('/admin/clients');
    revalidatePath('/admin/activity-logs');
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

export async function updateClientWizard(clientId: string, data: unknown) {
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

    const [{ data: beforeClient }, { data: beforeContactsRaw }, { data: loginUser }] = await Promise.all([
      adminSupabase.from('clients').select('*').eq('id', clientId).single(),
      adminSupabase
        .from('client_contacts')
        .select('first_name, last_name, email, phone, role')
        .eq('client_id', clientId)
        .order('created_at', { ascending: true }),
      adminSupabase.from('users').select('id, email').eq('client_id', clientId).maybeSingle(),
    ]);

    if (!beforeClient) {
      return { success: false, error: 'Client not found.' };
    }

    const emailConflict = await findPortalEmailConflict(adminSupabase, email, {
      excludeClientId: clientId,
      excludeUserId: loginUser?.id,
    });
    if (emailConflict) {
      return { success: false, error: emailConflict };
    }

    const uuidConflict = await findPortalUuidConflict(adminSupabase, profile.uuid_number, clientId);
    if (uuidConflict) {
      return { success: false, error: uuidConflict };
    }

    const updatePayload = buildClientUpdateData(profile);
    const { error: updateError } = await adminSupabase
      .from('clients')
      .update(updatePayload)
      .eq('id', clientId);
    if (updateError) throw updateError;

    if (loginUser && loginUser.email !== email) {
      const { error: userEmailError } = await adminSupabase
        .from('users')
        .update({ email })
        .eq('id', loginUser.id);
      if (userEmailError) throw userEmailError;
    }

    const beforeContacts = (beforeContactsRaw || []) as Array<{
      first_name: string;
      last_name: string;
      email: string;
      phone: string | null;
      role: string | null;
    }>;

    const { error: deleteContactsError } = await adminSupabase
      .from('client_contacts')
      .delete()
      .eq('client_id', clientId);
    if (deleteContactsError) throw deleteContactsError;

    const nextContacts = contacts.map((contact) => ({
      first_name: contact.first_name.trim(),
      last_name: contact.last_name.trim(),
      email: contact.email.trim().toLowerCase(),
      phone: optionalText(contact.phone),
      role: optionalText(contact.role),
    }));

    if (nextContacts.length > 0) {
      const contactRows = nextContacts.map((contact) => ({
        id: randomUUID(),
        client_id: clientId,
        ...contact,
      }));
      const { error: contactError } = await adminSupabase.from('client_contacts').insert(contactRows);
      if (contactError) throw contactError;
    }

    const beforeProfile = beforeClient as Record<string, unknown>;
    const profileChanges = buildActivityFieldChanges(
      {
        company_name: beforeProfile.company_name,
        uuid_number: beforeProfile.uuid_number,
        owner_name: beforeProfile.owner_name,
        email: beforeProfile.email,
        phone: beforeProfile.phone,
        primary_contact_first_name: beforeProfile.primary_contact_first_name,
        primary_contact_last_name: beforeProfile.primary_contact_last_name,
        address: beforeProfile.address,
        city: beforeProfile.city,
        state: beforeProfile.state,
        country: beforeProfile.country,
        postal_code: beforeProfile.postal_code,
        status: beforeProfile.status,
        regulatory_registrations: normalizeRegulatoryRegistrations(
          beforeProfile.regulatory_registrations
        ),
      },
      {
        company_name: updatePayload.company_name,
        uuid_number: updatePayload.uuid_number,
        owner_name: updatePayload.owner_name,
        email: updatePayload.email,
        phone: updatePayload.phone,
        primary_contact_first_name: updatePayload.primary_contact_first_name,
        primary_contact_last_name: updatePayload.primary_contact_last_name,
        address: updatePayload.address,
        city: updatePayload.city,
        state: updatePayload.state,
        country: updatePayload.country,
        postal_code: updatePayload.postal_code,
        status: updatePayload.status,
        regulatory_registrations: updatePayload.regulatory_registrations,
      },
      CLIENT_PROFILE_FIELD_LABELS
    );

    const contactNotes: string[] = [];
    const beforeByEmail = new Map(
      beforeContacts.map((c) => [c.email.trim().toLowerCase(), c] as const)
    );
    const afterByEmail = new Map(nextContacts.map((c) => [c.email, c] as const));

    for (const [emailKey, afterContact] of afterByEmail) {
      const beforeContact = beforeByEmail.get(emailKey);
      if (!beforeContact) {
        contactNotes.push(
          `Added secondary contact ${afterContact.first_name} ${afterContact.last_name} (${afterContact.email})`
        );
        continue;
      }
      const contactChanges = buildActivityFieldChanges(
        beforeContact as unknown as Record<string, unknown>,
        afterContact as unknown as Record<string, unknown>,
        CONTACT_FIELD_LABELS
      );
      if (contactChanges.length > 0) {
        contactNotes.push(
          `Updated ${afterContact.first_name} ${afterContact.last_name}: ${formatActivityFieldChangesDescription(contactChanges, 'details changed')}`
        );
      }
    }

    for (const [emailKey, beforeContact] of beforeByEmail) {
      if (!afterByEmail.has(emailKey)) {
        contactNotes.push(
          `Removed secondary contact ${beforeContact.first_name} ${beforeContact.last_name} (${beforeContact.email})`
        );
      }
    }

    const descriptionParts = [
      ...profileChanges.map((c) => `${c.label}: ${c.from} → ${c.to}`),
      ...contactNotes,
    ];

    await writeActivityLog(adminSupabase, {
      client_id: clientId,
      user_id: session.userId,
      action: 'CLIENT_UPDATED',
      entity_type: 'clients',
      entity_id: clientId,
      description:
        descriptionParts.length > 0
          ? descriptionParts.join('; ')
          : 'Client profile and contacts updated by admin',
      metadata: {
        changes: profileChanges,
        contact_notes: contactNotes,
      },
    });

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath(`/admin/clients/${clientId}/edit`);
    revalidatePath('/admin/clients');
    revalidatePath('/admin/activity-logs');
    return { success: true, message: 'Client profile updated successfully.' };
  } catch (err) {
    console.error('[CLIENT UPDATE ERROR]:', err);
    return { success: false, error: formatErrorMessage(err) };
  }
}
