-- =============================================================================
-- PHARMEGIC — DESTRUCTIVE RESET (DEVELOPMENT ONLY)
-- =============================================================================
-- WARNING: Running this file DELETES ALL DATA in public schema tables.
-- Use only for a completely fresh local/dev database.
-- For normal updates, use database.sql instead (safe, preserves data).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DROP TRIGGER IF EXISTS on_auth_user_changed ON auth.users;
DROP TRIGGER IF EXISTS trg_sync_clients_columns ON public.clients;
DROP TRIGGER IF EXISTS trg_sync_chemicals_columns ON public.chemicals;
DROP TRIGGER IF EXISTS trg_sync_tcc_applications_columns ON public.tcc_applications;
DROP TRIGGER IF EXISTS trg_sync_certificates_columns ON public.certificates;
DROP TRIGGER IF EXISTS trg_clients_updated_at ON public.clients;
DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
DROP TRIGGER IF EXISTS trg_client_chemicals_updated_at ON public.client_chemicals;
DROP TRIGGER IF EXISTS trg_tcc_applications_updated_at ON public.tcc_applications;
DROP TRIGGER IF EXISTS trg_internal_notes_updated_at ON public.internal_notes;

DROP TABLE IF EXISTS public.internal_notes CASCADE;
DROP TABLE IF EXISTS public.activity_logs CASCADE;
DROP TABLE IF EXISTS public.quota_transactions CASCADE;
DROP TABLE IF EXISTS public.templates CASCADE;
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.certificates CASCADE;
DROP TABLE IF EXISTS public.tcc_applications CASCADE;
DROP TABLE IF EXISTS public.client_chemicals CASCADE;
DROP TABLE IF EXISTS public.client_permissions CASCADE;
DROP TABLE IF EXISTS public.chemicals CASCADE;
DROP TABLE IF EXISTS public.client_contacts CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.clients CASCADE;
DROP TABLE IF EXISTS public.admin_settings CASCADE;

DROP TYPE IF EXISTS public.user_role CASCADE;
DROP TYPE IF EXISTS public.client_status CASCADE;
DROP TYPE IF EXISTS public.chemical_status CASCADE;
DROP TYPE IF EXISTS public.tcc_status CASCADE;
DROP TYPE IF EXISTS public.certificate_status CASCADE;

-- After this file, run database.sql to recreate schema and optional seed data.
