'use client';

import { createClientAction, updateClientWizardAction } from '@/actions/client-wizard';
import { formatErrorMessage } from '@/lib/format-error';
import { formatMobileNumberInput, getMobileNumberError } from '@/lib/mobile-number';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { ModalErrorBox } from './ui/ModalErrorBox';
import { FormLabel } from './ui/FormLabel';
import { toast } from '@/store/toast';
import RegulatoryRegistrationsField from '@/components/RegulatoryRegistrationsField';
import {
  normalizeRegulatoryRegistrations,
  type RegulatoryRegistration,
} from '@/lib/regulatory-registrations';
import { useState, useTransition } from 'react';
import { Eye, EyeOff, Plus, Save, Trash2 } from 'lucide-react';

export type ClientWizardContact = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  role: string;
};

export type ClientWizardProfile = {
  company_name: string;
  uuid_number: string;
  primary_contact_first_name: string;
  primary_contact_last_name: string;
  email: string;
  password: string;
  owner_name: string;
  phone: string;
  cc_emails: string;
  cc_phones: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postal_code: string;
  status: 'active' | 'inactive' | 'pending';
  regulatory_registrations: string[];
};

interface ClientWizardProps {
  onSuccess: () => void;
  onCancel: () => void;
  mode?: 'create' | 'edit';
  clientId?: string;
  initialProfile?: Partial<ClientWizardProfile>;
  initialContacts?: ClientWizardContact[];
  initialRegistrations?: RegulatoryRegistration[];
}

const defaultProfile: ClientWizardProfile = {
  company_name: '',
  uuid_number: '',
  primary_contact_first_name: '',
  primary_contact_last_name: '',
  email: '',
  password: '',
  owner_name: '',
  phone: '',
  cc_emails: '',
  cc_phones: '',
  address: '',
  city: '',
  state: '',
  country: 'India',
  postal_code: '',
  status: 'active',
  regulatory_registrations: [],
};

export default function ClientWizard({
  onSuccess,
  onCancel,
  mode = 'create',
  clientId,
  initialProfile,
  initialContacts = [],
  initialRegistrations = [],
}: ClientWizardProps) {
  const isEdit = mode === 'edit';
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);

  const [profile, setProfile] = useState<ClientWizardProfile>({
    ...defaultProfile,
    ...initialProfile,
    phone: initialProfile?.phone ? formatMobileNumberInput(initialProfile.phone) : '',
  });

  const [contacts, setContacts] = useState<ClientWizardContact[]>(initialContacts);
  const [regulatoryRegistrations, setRegulatoryRegistrations] = useState<RegulatoryRegistration[]>(
    normalizeRegulatoryRegistrations(initialRegistrations)
  );
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; phone?: string }>({});

  const [tempContact, setTempContact] = useState<ClientWizardContact>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    role: '',
  });

  const handleEmailChange = (value: string) => {
    setProfile((p) => ({ ...p, email: value }));
    if (!value) {
      setFieldErrors((e) => ({ ...e, email: 'Email is required' }));
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setFieldErrors((e) => ({ ...e, email: 'Enter a valid email address' }));
    } else {
      setFieldErrors((e) => ({ ...e, email: undefined }));
    }
  };

  const handlePhoneChange = (value: string) => {
    const formatted = formatMobileNumberInput(value);
    setProfile((p) => ({ ...p, phone: formatted }));
    setFieldErrors((e) => ({ ...e, phone: getMobileNumberError(formatted, true) }));
  };

  const handleContactPhoneChange = (value: string) => {
    const formatted = formatMobileNumberInput(value);
    setTempContact((contact) => ({ ...contact, phone: formatted }));
  };

  const validateForm = () => {
    if (!profile.company_name.trim()) return 'Company name is required';
    if (!profile.uuid_number.trim()) return 'UUID number is required';
    if (!profile.primary_contact_first_name) return 'Primary contact first name is required';
    if (!profile.primary_contact_last_name) return 'Primary contact last name is required';
    if (!profile.email) return 'Primary contact email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) return 'Invalid email format';
    if (!isEdit && (!profile.password || profile.password.length < 6)) {
      return 'Password must be at least 6 characters';
    }
    if (getMobileNumberError(profile.phone, true)) return 'Enter a valid primary contact mobile number';
    if (!profile.address.trim()) return 'Address is required';
    if (!profile.postal_code.trim()) return 'Postal code is required';
    if (!profile.country.trim()) return 'Country is required';
    if (regulatoryRegistrations.length === 0) {
      return 'Select at least one regulatory registration.';
    }
    return null;
  };

  const addContact = () => {
    if (!tempContact.first_name || !tempContact.last_name || !tempContact.email) {
      setContactError('First name, last name and email are required for adding a contact.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tempContact.email)) {
      setContactError('Invalid contact email format.');
      return;
    }

    if (tempContact.phone && getMobileNumberError(tempContact.phone)) {
      setContactError('Enter a valid mobile number (e.g. +91 123 456 7890).');
      return;
    }

    setContactError(null);
    setContacts([...contacts, tempContact]);
    setTempContact({ first_name: '', last_name: '', email: '', phone: '', role: '' });
    toast.success('Secondary contact added to list.');
  };

  const removeContact = (index: number) => {
    setContacts(contacts.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    setError(null);
    setRegistrationError(null);
    const validationError = validateForm();
    if (validationError) {
      if (validationError.includes('regulatory registration')) {
        setRegistrationError(validationError);
      }
      setError(validationError);
      return;
    }

    const payload = {
      profile: { ...profile, regulatory_registrations: regulatoryRegistrations },
      contacts,
    };

    startTransition(async () => {
      const res = isEdit
        ? await updateClientWizardAction(clientId!, payload)
        : await createClientAction(null, payload);

      if (!res.success) {
        const message =
          typeof res.error === 'string'
            ? res.error
            : formatErrorMessage(res.error) || `Failed to ${isEdit ? 'update' : 'create'} client.`;
        setError(message);
        return;
      }

      toast.success(
        res.message ||
          (isEdit
            ? 'Client profile updated successfully.'
            : 'Client created and login credentials set successfully.')
      );
      onSuccess();
    });
  };

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          {isEdit ? 'Edit Client Contact Form' : 'New Client Contact Form'}
        </h2>
        <p className="text-sm text-slate-500">
          {isEdit
            ? 'Update the client profile, primary contact, secondary contacts, and address details.'
            : 'Create the client profile, assign contacts, and set an initial password in one page.'}
        </p>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Company Details</h3>
            <p className="text-xs text-slate-500">Basic client organization information.</p>
          </div>
        </div>

        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          <Input
            label="Company Name"
            placeholder="Pharmegic Ltd."
            value={profile.company_name}
            onChange={(e) => setProfile({ ...profile, company_name: e.target.value })}
            required
          />
          <Input
            label="UUID Number"
            placeholder="e.g. AP-882-2025"
            value={profile.uuid_number}
            onChange={(e) => setProfile({ ...profile, uuid_number: e.target.value })}
            required
          />
          <Input
            label="Owner / Company Representative"
            placeholder="Ahmet Yilmaz"
            value={profile.owner_name}
            onChange={(e) => setProfile({ ...profile, owner_name: e.target.value })}
          />
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Primary Person</h3>
            <p className="text-xs text-slate-500">Primary contact details for the client account.</p>
          </div>
        </div>

        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          <Input
            label="First Name"
            placeholder="Jane"
            value={profile.primary_contact_first_name}
            onChange={(e) => setProfile({ ...profile, primary_contact_first_name: e.target.value })}
            required
          />
          <Input
            label="Last Name"
            placeholder="Doe"
            value={profile.primary_contact_last_name}
            onChange={(e) => setProfile({ ...profile, primary_contact_last_name: e.target.value })}
            required
          />
          <div className="w-full flex flex-col gap-1">
            <Input
              type="email"
              label="Email Address"
              placeholder="jane@company.com"
              value={profile.email}
              onChange={(e) => handleEmailChange(e.target.value)}
              autoComplete="off"
              required
            />
            {fieldErrors.email && (
              <p className="text-xs text-rose-500 flex items-center gap-1 mt-0.5">
                <span>⚠</span> {fieldErrors.email}
              </p>
            )}
          </div>
          <div className="w-full flex flex-col gap-1">
            <Input
              label="Mobile Number"
              placeholder="+91 123 456 7890"
              value={profile.phone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              required
            />
            {fieldErrors.phone && (
              <p className="text-xs text-rose-500 flex items-center gap-1 mt-0.5">
                <span>⚠</span> {fieldErrors.phone}
              </p>
            )}
          </div>
          {!isEdit && (
            <div className="w-full flex flex-col gap-1.5">
              <FormLabel required>Password</FormLabel>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="client-initial-password"
                  name="client-initial-password"
                  autoComplete="new-password"
                  data-1p-ignore
                  data-lpignore="true"
                  readOnly
                  onFocus={(e) => {
                    e.currentTarget.readOnly = false;
                  }}
                  placeholder="Create a temporary password"
                  value={profile.password}
                  onChange={(e) => setProfile({ ...profile, password: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-white px-3 pr-10 py-2 text-sm ring-offset-background placeholder:text-slate-400 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Secondary Person Contact</h3>
            <p className="text-xs text-slate-500">Optional secondary contacts for the client account.</p>
          </div>
        </div>

        <div className="mt-6 p-4 rounded-3xl bg-slate-50 border border-slate-100 grid gap-4 grid-cols-1 md:grid-cols-2">
          <h4 className="md:col-span-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
            Add Secondary Contact Officer
          </h4>
          <Input
            label="First Name"
            placeholder="John"
            value={tempContact.first_name}
            onChange={(e) => setTempContact({ ...tempContact, first_name: e.target.value })}
          />
          <Input
            label="Last Name"
            placeholder="Smith"
            value={tempContact.last_name}
            onChange={(e) => setTempContact({ ...tempContact, last_name: e.target.value })}
          />
          <Input
            type="email"
            label="Email"
            placeholder="john@company.com"
            value={tempContact.email}
            onChange={(e) => setTempContact({ ...tempContact, email: e.target.value })}
          />
          <Input
            label="Mobile Number"
            placeholder="+91 123 456 7890"
            value={tempContact.phone}
            onChange={(e) => handleContactPhoneChange(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
          />
          <Input
            label="Position / Role"
            placeholder="Compliance Manager"
            value={tempContact.role}
            onChange={(e) => setTempContact({ ...tempContact, role: e.target.value })}
          />
          <div className="md:col-span-2 flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={addContact}>
              <Plus className="h-4 w-4 mr-1.5" /> Add Contact
            </Button>
          </div>
        </div>
        <ModalErrorBox message={contactError} title="Contact Error" />

        <div className="mt-4 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Saved Secondary Contacts ({contacts.length})
          </h4>
          {contacts.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
              No secondary contact officers added yet.
            </div>
          ) : (
            <div className="rounded-3xl border border-slate-100 bg-white divide-y divide-slate-100 overflow-hidden">
              {contacts.map((contact, idx) => (
                <div
                  key={idx}
                  className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="font-semibold text-slate-900">
                      {contact.first_name} {contact.last_name}
                    </div>
                    <div className="text-sm text-slate-500">
                      {contact.email} {contact.role ? `• ${contact.role}` : ''}
                    </div>
                    {contact.phone ? <div className="text-sm text-slate-500">{contact.phone}</div> : null}
                  </div>
                  <Button type="button" variant="ghost" onClick={() => removeContact(idx)}>
                    <Trash2 className="h-4 w-4" /> Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <RegulatoryRegistrationsField
        value={regulatoryRegistrations}
        onChange={(next) => {
          setRegulatoryRegistrations(next);
          setRegistrationError(null);
        }}
        error={registrationError}
      />

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Address Details</h3>
            <p className="text-xs text-slate-500">Client billing / office address information.</p>
          </div>
        </div>

        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          <div className="md:col-span-2">
            <Input
              label="Address"
              placeholder="100 Compliance Boulevard, Suite 50"
              value={profile.address}
              onChange={(e) => setProfile({ ...profile, address: e.target.value })}
              required
            />
          </div>
          <Input
            label="City"
            placeholder="Ahmedabad"
            value={profile.city}
            onChange={(e) => setProfile({ ...profile, city: e.target.value })}
          />
          <Input
            label="State"
            placeholder="Gujarat"
            value={profile.state}
            onChange={(e) => setProfile({ ...profile, state: e.target.value })}
          />
          <Input
            label="Postal Code"
            placeholder="382445"
            value={profile.postal_code}
            onChange={(e) => setProfile({ ...profile, postal_code: e.target.value })}
            required
          />
          <Input
            label="Country"
            placeholder="India"
            value={profile.country}
            onChange={(e) => setProfile({ ...profile, country: e.target.value })}
            required
          />
        </div>
      </section>

      <ModalErrorBox message={error} title={isEdit ? 'Update Error' : 'Onboarding Error'} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSubmit} isLoading={isPending} disabled={isPending}>
          {isEdit ? (
            <>
              Save Client Profile <Save className="ml-2 h-4 w-4" />
            </>
          ) : (
            <>
              Create Client and Set Password <Save className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
