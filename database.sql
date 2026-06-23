-- =============================================================================
-- PHARMEGIC HEALTHCARE DATABASE SCHEMA (SAFE / IDEMPOTENT)
-- =============================================================================
-- Safe to re-run: does NOT drop tables or delete existing rows.
-- - Creates missing tables, columns, indexes, triggers, and policies
-- - Seed inserts use ON CONFLICT DO NOTHING (no overwrites)
--
-- Need a completely empty database? Use database.reset.sql first (DEV ONLY),
-- then run this file.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ENUMS (create only if missing)
-- ============================================================================
DO $$ BEGIN
    CREATE TYPE public.user_role AS ENUM ('SUPER_ADMIN', 'MASTER_ADMIN', 'CLIENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public.client_status AS ENUM ('active', 'inactive', 'pending');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public.chemical_status AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public.tcc_status AS ENUM ('pending', 'approved', 'rejected', 'changes_required', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public.certificate_status AS ENUM ('active', 'expired', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 1. ADMIN SETTINGS (Singleton)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    full_name TEXT DEFAULT 'Admin User',
    mobile_number TEXT DEFAULT '',
    email TEXT DEFAULT 'directoratulpatoliya@gmail.com',
    cc_emails TEXT DEFAULT '',
    bcc_emails TEXT DEFAULT '',
    timezone TEXT DEFAULT 'UTC',
    profile_image TEXT,
    smtp_host TEXT DEFAULT '',
    smtp_port INTEGER DEFAULT 587,
    smtp_user TEXT DEFAULT '',
    smtp_pass TEXT DEFAULT '',
    smtp_from TEXT DEFAULT '',
    smtp_cc_default TEXT DEFAULT '',
    rc_smtp_host TEXT DEFAULT '',
    rc_smtp_port INTEGER DEFAULT 587,
    rc_smtp_user TEXT DEFAULT '',
    rc_smtp_pass TEXT DEFAULT '',
    rc_smtp_from TEXT DEFAULT '',
    rc_smtp_cc_default TEXT DEFAULT '',
    tcc_application_notification_emails TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT single_row CHECK (id = 1)
);

-- ============================================================================
-- 2. CLIENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    company_name TEXT NOT NULL,
    legal_name TEXT,
    uuid_number TEXT UNIQUE,
    registration_number TEXT,
    owner_name TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    postal_code TEXT,
    country TEXT DEFAULT 'Turkey',
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    primary_contact_first_name TEXT,
    primary_contact_last_name TEXT,
    cc_emails TEXT,
    cc_phones TEXT,
    status public.client_status DEFAULT 'pending',
    regulatory_registrations TEXT[] DEFAULT '{}'
);

-- ============================================================================
-- 3. USERS TABLE (Custom Auth — NOT linked to Supabase Auth)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role public.user_role NOT NULL DEFAULT 'CLIENT',
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    is_disabled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================================
-- 4. CLIENT CONTACTS (Secondary)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.client_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    role TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================================
-- 5. CHEMICALS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.chemicals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chemical_name TEXT NOT NULL,
    cas_number TEXT UNIQUE NOT NULL,
    ec_number TEXT,
    tonnage_band TEXT,
    available_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (available_quantity >= 0),
    exported_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (exported_quantity >= 0),
    validity_date DATE,
    status public.chemical_status DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================================
-- 6. CLIENT CHEMICALS (Authorized Chemicals per Client — with quota)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.client_chemicals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    chemical_id UUID NOT NULL REFERENCES public.chemicals(id) ON DELETE CASCADE,
    available_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (available_quantity >= 0),
    validity_date DATE,
    registration_number TEXT,
    issued_date DATE,
    certificate_number TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'suspended', 'trashed')),
    assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(client_id, chemical_id)
);

-- ============================================================================
-- 7. TCC APPLICATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tcc_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tracking_id TEXT UNIQUE,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    chemical_id UUID NOT NULL REFERENCES public.chemicals(id) ON DELETE CASCADE,
    client_chemical_id UUID REFERENCES public.client_chemicals(id) ON DELETE SET NULL,
    reach_certificate_id UUID REFERENCES public.certificates(id) ON DELETE SET NULL,
    quantity_mt NUMERIC(12, 2) NOT NULL CHECK (quantity_mt > 0),
    export_date DATE,
    registration_number TEXT,
    remarks TEXT,
    bo_attachment_url TEXT,
    bo_attachment_name TEXT,
    eu_importer_company_name TEXT,
    eu_importer_address TEXT,
    purchase_order_number TEXT,
    invoice_number TEXT,
    status public.tcc_status DEFAULT 'pending',
    rejection_reason TEXT,
    approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================================
-- 8. CERTIFICATES TABLE (with mail tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certificate_number TEXT UNIQUE NOT NULL,
    tcc_application_id UUID REFERENCES public.tcc_applications(id) ON DELETE CASCADE UNIQUE,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    chemical_id UUID REFERENCES public.chemicals(id) ON DELETE SET NULL,
    type TEXT DEFAULT 'TCC',
    registration_number TEXT,
    file_url TEXT,
    allocated_quantity NUMERIC(12, 2),
    tonnage_band TEXT,
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    status public.certificate_status DEFAULT 'active',
    mail_sent BOOLEAN NOT NULL DEFAULT false,
    mail_sent_at TIMESTAMP WITH TIME ZONE,
    mail_sent_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    mail_resend_count INTEGER NOT NULL DEFAULT 0,
    last_resend_at TIMESTAMP WITH TIME ZONE,
    last_resend_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    mail_sent_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================================
-- 9. QUOTA TRANSACTIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.quota_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    chemical_id UUID NOT NULL REFERENCES public.chemicals(id) ON DELETE CASCADE,
    tcc_application_id UUID REFERENCES public.tcc_applications(id) ON DELETE SET NULL,
    quantity_mt NUMERIC(12, 2) NOT NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('deduct', 'restore', 'assign')),
    performed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================================
-- 10. NOTIFICATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    read BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================================
-- 11. ACTIVITY LOGS TABLE (per client timeline)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================================
-- 12. AUDIT LOGS (general system audit)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================================
-- 13. INTERNAL NOTES (admin-only notes per client)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.internal_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    author_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    note TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================================
-- 14. TEMPLATES TABLE (Certificate Branding)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    logo TEXT,
    accent_color TEXT DEFAULT '#064e3b' NOT NULL,
    footer_text TEXT,
    signature_image TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================================
-- COLUMN MIGRATIONS (add new columns without touching existing rows)
-- ============================================================================
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS login_password TEXT;

ALTER TABLE public.tcc_applications ADD COLUMN IF NOT EXISTS bo_attachment_url TEXT;
ALTER TABLE public.tcc_applications ADD COLUMN IF NOT EXISTS bo_attachment_name TEXT;
ALTER TABLE public.tcc_applications ADD COLUMN IF NOT EXISTS eu_importer_company_name TEXT;
ALTER TABLE public.tcc_applications ADD COLUMN IF NOT EXISTS eu_importer_address TEXT;
ALTER TABLE public.tcc_applications ADD COLUMN IF NOT EXISTS purchase_order_number TEXT;
ALTER TABLE public.tcc_applications ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE public.tcc_applications ADD COLUMN IF NOT EXISTS reach_certificate_id UUID REFERENCES public.certificates(id) ON DELETE SET NULL;
ALTER TABLE public.tcc_applications ADD COLUMN IF NOT EXISTS certificate_issue_date DATE;

ALTER TABLE public.admin_settings ADD COLUMN IF NOT EXISTS rc_smtp_host TEXT DEFAULT '';
ALTER TABLE public.admin_settings ADD COLUMN IF NOT EXISTS rc_smtp_port INTEGER DEFAULT 587;
ALTER TABLE public.admin_settings ADD COLUMN IF NOT EXISTS rc_smtp_user TEXT DEFAULT '';
ALTER TABLE public.admin_settings ADD COLUMN IF NOT EXISTS rc_smtp_pass TEXT DEFAULT '';
ALTER TABLE public.admin_settings ADD COLUMN IF NOT EXISTS rc_smtp_from TEXT DEFAULT '';
ALTER TABLE public.admin_settings ADD COLUMN IF NOT EXISTS rc_smtp_cc_default TEXT DEFAULT '';
ALTER TABLE public.admin_settings ADD COLUMN IF NOT EXISTS tcc_application_notification_emails TEXT DEFAULT '';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS regulatory_registrations TEXT[] DEFAULT '{}';
ALTER TABLE public.tcc_applications ADD COLUMN IF NOT EXISTS regulatory_framework TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS link TEXT;

ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS chemical_id UUID REFERENCES public.chemicals(id) ON DELETE SET NULL;
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS registration_number TEXT;
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS mail_sent_history JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS allocated_quantity NUMERIC(12, 2);
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS tonnage_band TEXT;
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tcc_applications'
      AND column_name = 'kkdik_reg_no'
  ) THEN
    ALTER TABLE public.tcc_applications RENAME COLUMN kkdik_reg_no TO registration_number;
  END IF;
END $$;

ALTER TABLE public.client_chemicals ADD COLUMN IF NOT EXISTS registration_number TEXT;
ALTER TABLE public.client_chemicals ADD COLUMN IF NOT EXISTS issued_date DATE;
ALTER TABLE public.client_chemicals ADD COLUMN IF NOT EXISTS certificate_number TEXT;

ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS rc_template_key TEXT DEFAULT 'template_1';
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS tcc_template_key TEXT DEFAULT 'template_1';
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS rc_logo TEXT;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS rc_signature_image TEXT;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS rc_accent_color TEXT DEFAULT '#064e3b';
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS rc_footer_text TEXT;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS tcc_logo TEXT;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS tcc_signature_image TEXT;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS tcc_accent_color TEXT DEFAULT '#064e3b';
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS tcc_footer_text TEXT;

UPDATE public.templates
SET
  rc_logo = COALESCE(rc_logo, logo),
  rc_signature_image = COALESCE(rc_signature_image, signature_image),
  rc_accent_color = COALESCE(rc_accent_color, accent_color),
  rc_footer_text = COALESCE(rc_footer_text, footer_text),
  tcc_logo = COALESCE(tcc_logo, logo),
  tcc_signature_image = COALESCE(tcc_signature_image, signature_image),
  tcc_accent_color = COALESCE(tcc_accent_color, accent_color),
  tcc_footer_text = COALESCE(tcc_footer_text, footer_text)
WHERE logo IS NOT NULL OR signature_image IS NOT NULL OR accent_color IS NOT NULL OR footer_text IS NOT NULL;

-- Allow trashed status on client_chemicals (existing DBs may have old constraint)
ALTER TABLE public.client_chemicals DROP CONSTRAINT IF EXISTS client_chemicals_status_check;
ALTER TABLE public.client_chemicals
    ADD CONSTRAINT client_chemicals_status_check
    CHECK (status IN ('active', 'expired', 'suspended', 'trashed'));

-- Allow trashed status on global chemicals registry
DO $$ BEGIN
    ALTER TYPE public.chemical_status ADD VALUE 'trashed';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_clients_email ON public.clients(email);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_client_id ON public.users(client_id);
CREATE INDEX IF NOT EXISTS idx_client_contacts_client_id ON public.client_contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_chemicals_cas ON public.chemicals(cas_number);
CREATE INDEX IF NOT EXISTS idx_client_chemicals_client ON public.client_chemicals(client_id);
CREATE INDEX IF NOT EXISTS idx_tcc_applications_client_id ON public.tcc_applications(client_id);
CREATE INDEX IF NOT EXISTS idx_tcc_applications_status ON public.tcc_applications(status);
CREATE INDEX IF NOT EXISTS idx_certificates_client_id ON public.certificates(client_id);
CREATE INDEX IF NOT EXISTS idx_certificates_number ON public.certificates(certificate_number);
CREATE INDEX IF NOT EXISTS idx_certificates_reach ON public.certificates(client_id, chemical_id, type);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_activity_logs_client ON public.activity_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_quota_transactions_client ON public.quota_transactions(client_id);

-- ============================================================================
-- AUTO-UPDATE updated_at TRIGGER FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clients_updated_at ON public.clients;
CREATE TRIGGER trg_clients_updated_at
    BEFORE UPDATE ON public.clients
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_client_chemicals_updated_at ON public.client_chemicals;
CREATE TRIGGER trg_client_chemicals_updated_at
    BEFORE UPDATE ON public.client_chemicals
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_tcc_applications_updated_at ON public.tcc_applications;
CREATE TRIGGER trg_tcc_applications_updated_at
    BEFORE UPDATE ON public.tcc_applications
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_internal_notes_updated_at ON public.internal_notes;
CREATE TRIGGER trg_internal_notes_updated_at
    BEFORE UPDATE ON public.internal_notes
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chemicals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_chemicals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tcc_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quota_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON public.admin_settings;
CREATE POLICY "Service role full access" ON public.admin_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.clients;
CREATE POLICY "Service role full access" ON public.clients FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.users;
CREATE POLICY "Service role full access" ON public.users FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.client_contacts;
CREATE POLICY "Service role full access" ON public.client_contacts FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.chemicals;
CREATE POLICY "Service role full access" ON public.chemicals FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.client_chemicals;
CREATE POLICY "Service role full access" ON public.client_chemicals FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.tcc_applications;
CREATE POLICY "Service role full access" ON public.tcc_applications FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.certificates;
CREATE POLICY "Service role full access" ON public.certificates FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.quota_transactions;
CREATE POLICY "Service role full access" ON public.quota_transactions FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.notifications;
CREATE POLICY "Service role full access" ON public.notifications FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.activity_logs;
CREATE POLICY "Service role full access" ON public.activity_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.audit_logs;
CREATE POLICY "Service role full access" ON public.audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.internal_notes;
CREATE POLICY "Service role full access" ON public.internal_notes FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.templates;
CREATE POLICY "Service role full access" ON public.templates FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- SEED DATA (insert only when missing — never overwrites existing rows)
-- ============================================================================
INSERT INTO public.admin_settings (id, full_name, email)
VALUES (1, 'Admin User', 'directoratulpatoliya@gmail.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.templates (id, logo, accent_color, footer_text, signature_image)
VALUES (
  'd4e30b6f-6c18-472e-8d8a-36fb644b9b94',
  null,
  '#064e3b',
  'Pharmegic Healthcare Compliance Division. For verification, scan the QR code.',
  null
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.chemicals (chemical_name, cas_number, ec_number, tonnage_band, validity_date, available_quantity, exported_quantity, status)
VALUES
('Ethylene Glycol Monoethyl Ether', '110-80-5', '203-804-1', '10-100 tonnes', '2027-12-31', 150.00, 25.50, 'active'),
('N-Methyl-2-pyrrolidone (NMP)', '872-50-4', '212-828-1', '100-1000 tonnes', '2028-06-30', 800.00, 120.00, 'active'),
('Trichloroethylene', '79-01-6', '201-167-4', '1-10 tonnes', '2026-12-31', 8.50, 1.20, 'active'),
('Dimethylformamide (DMF)', '68-12-2', '200-679-5', '100-1000 tonnes', '2027-09-15', 500.00, 0.00, 'active')
ON CONFLICT (cas_number) DO NOTHING;

-- Default admin accounts (only created if email does not exist yet)
INSERT INTO public.users (email, password_hash, role, is_disabled)
VALUES
('atul.patoliya@gmail.com', '$2b$12$nFbwz4f2OVFV.oISYd028emI1rdc58Zoi5BxRnfXtbaKFa9D3u9pm', 'SUPER_ADMIN', false),
('directoratulpatoliya@gmail.com', '$2b$12$oe./N.URUVDKV90AQARTieIOl0MmvZ68jX9skCUtEtTK6ppWHnxOq', 'MASTER_ADMIN', false)
ON CONFLICT (email) DO NOTHING;
