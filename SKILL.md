# Pharmegic Healthcare Portal — Agent Skill & Instructions Guide

Use this document to quickly onboard and understand the rules, structure, and operations of the Pharmegic Healthcare Compliance Portal.

---

## 1. Project Overview & Tech Stack
- **Framework**: Next.js 16.2.6 (App Router) + React 19.2.4
- **Database**: Supabase (Postgres)
- **Auth**: Supabase SSR Auth
- **CSS**: Tailwind CSS v4
- **PDF Generation**: `@react-pdf/renderer`
- **Validation**: Zod v4

---

## 2. Key Commands
- **Run dev server**: `npm run dev`
- **Run linter**: `npm run lint`
- **Bootstrap Admin**: `node scripts/create-admin.js <email> <password>`
- **Database Migrations**: Run the SQL in `database.sql` directly inside the Supabase SQL Editor.

---

## 3. Database Schema (`/database.sql`)
Always use the single canonical schema file in the root directory: [database.sql](file:///d:/Learning/Pharmegic/Pharmegic-1/database.sql).
- **Core Tables**: `clients`, `users`, `client_contacts`, `chemicals`, `tcc_applications`, `certificates`, `notifications`, `audit_logs`, `templates`, `client_chemicals`.
- **Sync Triggers**: Syncs columns between dual-schema naming conventions (e.g., `company_name`/`name`, `export_date`/`expected_export_date`).
- **Auth Sync**: `handle_auth_user_changes()` trigger automatically inserts or updates `public.users` when a user signs up or changes metadata in `auth.users`.
- **RLS**: Row Level Security is active on all tables. Use `public.is_admin_or_staff(auth.uid())` to check admin status.

---

## 4. Key Implementation Rules
- **Database updates**: If you change the database schema, **always update the root [database.sql](file:///d:/Learning/Pharmegic/Pharmegic-1/database.sql)** first.
- **Supabase client selection**:
  - Use server client `lib/supabase/server.ts` for Pages and Server Actions.
  - Use browser client `lib/supabase/client.ts` only for browser-side interactions.
  - Use admin client `lib/supabase/admin.ts` (bypasses RLS) only for backend admin actions (e.g., auth registration, storage uploads, public verification).
- **Authentication Guarding**:
  - Middleware is defined in `proxy.ts`. Ensure it is exported properly in `middleware.ts`.
  - Check user role via the `role` metadata or the `public.users` table.

---

## 5. Token Optimization Guidelines
- **Avoid full file reads**: Use targeted line range views for files longer than 200 lines.
- **Incremental edits**: Use `replace_file_content` instead of rewriting entire files.
