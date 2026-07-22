import { z } from 'zod';
import { REGULATORY_REGISTRATIONS } from '@/lib/regulatory-registrations';

const regulatoryRegistrationSchema = z.enum([
  REGULATORY_REGISTRATIONS.EU_REACH,
  REGULATORY_REGISTRATIONS.UK_REACH,
  REGULATORY_REGISTRATIONS.TURKEY_KKDIK,
]);

// ============================================================================
// AUTHENTICATION
// ============================================================================
export const loginSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
});

// ============================================================================
// CLIENT SCHEMAS
// ============================================================================
const contactSchema = z.object({
  first_name: z.string().min(1, { message: 'First name is required' }),
  last_name: z.string().min(1, { message: 'Last name is required' }),
  email: z.string().email({ message: 'Invalid email' }),
  phone: z.string().optional().or(z.literal('')),
  role: z.string().optional().or(z.literal('')),
});

// ============================================================================
// PARTIAL CLIENT WIZARD (Hostinger WAF workaround)
//
// We allow partial profile updates so the UI can split the update into:
// 1) profile/address update without `email` + `phone`
// 2) email/phone + contacts update without address fields
//
// All keys are optional; when keys are omitted, the service merges with the
// existing DB values. We intentionally avoid zod `.default()` here so missing
// `contacts` does NOT get treated as `[]` (which would delete contacts).
// ============================================================================
const clientProfileEditPartialSchema = z.object({
  company_name: z.string().min(2, { message: 'Company name is required' }).optional(),
  uuid_number: z.string().min(1, { message: 'UUID number is required' }).optional(),
  primary_contact_first_name: z
    .string()
    .min(1, { message: 'First name is required' })
    .optional(),
  primary_contact_last_name: z
    .string()
    .min(1, { message: 'Last name is required' })
    .optional(),
  email: z.string().email({ message: 'Invalid primary contact email' }).optional(),
  // owner_name + phone can be omitted OR empty-string when UI sends ''.
  owner_name: z.string().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  address: z.string().min(1, { message: 'Address is required' }).optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().min(1, { message: 'Country is required' }).optional(),
  postal_code: z.string().min(1, { message: 'Postal code is required' }).optional(),
  status: z.enum(['active', 'inactive', 'pending']).optional(),
  regulatory_registrations: z
    .array(regulatoryRegistrationSchema)
    .min(1, { message: 'Select at least one regulatory registration.' })
    .optional(),
});

export const clientWizardEditPartialSchema = z.object({
  profile: clientProfileEditPartialSchema.extend({
    password: z.string().min(6, { message: 'Password must be at least 6 characters' }).optional().or(z.literal('')),
  }),
  contacts: z.array(contactSchema).optional(),
});

/** Step 1 of split create — address + company only (WAF-safe payload). */
export const clientWizardCreateDraftSchema = z.object({
  profile: z.object({
    company_name: z.string().min(2, { message: 'Company name is required' }),
    uuid_number: z.string().min(1, { message: 'UUID number is required' }),
    primary_contact_first_name: z.string().min(1, { message: 'First name is required' }),
    primary_contact_last_name: z.string().min(1, { message: 'Last name is required' }),
    address: z.string().min(1, { message: 'Address is required' }),
    city: z.string(),
    state: z.string(),
    country: z.string().min(1, { message: 'Country is required' }),
    postal_code: z.string().min(1, { message: 'Postal code is required' }),
  }),
});

// ============================================================================
// INTERNAL NOTE
// ============================================================================
export const internalNoteSchema = z.object({
  note: z.string().min(1, { message: 'Note cannot be empty' }).max(2000),
});

// ============================================================================
// TCC APPLICATION
// ============================================================================
const tccApplicationCommonSchema = {
  quantity_mt: z.coerce.number().positive({ message: 'Quantity must be greater than 0' }),
  regulatory_framework: regulatoryRegistrationSchema,
  export_date: z.string().min(1, { message: 'PO date is required' }),
  eu_importer_company_name: z.string().min(1, { message: 'EU importer company name is required' }),
  eu_importer_address: z.string().min(1, { message: 'EU importer address is required' }),
  purchase_order_number: z.string().min(1, { message: 'Purchase order number is required' }),
  invoice_number: z
    .preprocess((val) => (val == null || val === '' ? undefined : String(val)), z.string().optional()),
};

export const tccEuApplicationSchema = z.object({
  ...tccApplicationCommonSchema,
  chemical_id: z.string().uuid({ message: 'Please select a substance' }),
  registration_number: z
    .preprocess((val) => (val == null || val === '' ? undefined : String(val)), z.string().optional()),
  remarks: z
    .preprocess((val) => (val == null || val === '' ? undefined : String(val)), z.string().optional()),
});

export const tccNotificationApplicationSchema = z.object({
  ...tccApplicationCommonSchema,
  case_number: z.string().min(1, { message: 'Case number is required' }),
});

export const adminTccApplicationUpdateSchema = z.object({
  application_id: z.string().uuid({ message: 'Application id is required' }),
  eu_importer_company_name: z.string().min(1, { message: 'EU importer company name is required' }),
  eu_importer_address: z.string().min(1, { message: 'EU importer address is required' }),
  purchase_order_number: z.string().min(1, { message: 'Purchase order number is required' }),
  invoice_number: z
    .preprocess((val) => (val == null || val === '' ? undefined : String(val)), z.string().optional()),
  quantity_mt: z.coerce.number().positive({ message: 'Quantity must be greater than 0' }),
  export_date: z.string().min(1, { message: 'PO date is required' }),
  issue_date: z
    .preprocess((val) => (val == null || val === '' ? undefined : String(val)), z.string().optional()),
  valid_until_date: z
    .preprocess((val) => (val == null || val === '' ? undefined : String(val)), z.string().optional()),
  certificate_id: z
    .preprocess((val) => (val == null || val === '' ? undefined : String(val)), z.string().uuid().optional()),
  registration_number: z
    .preprocess((val) => (val == null || val === '' ? undefined : String(val)), z.string().optional()),
  remarks: z
    .preprocess((val) => (val == null || val === '' ? undefined : String(val)), z.string().optional()),
});

// ============================================================================
// CHANGE CLIENT CREDENTIALS (admin only)
// ============================================================================
export const changePasswordSchema = z.object({
  new_password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
});

export const changeEmailSchema = z.object({
  new_email: z.string().email({ message: 'Invalid email address' }),
});
