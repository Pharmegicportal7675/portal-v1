# Pharmegic Project Details

## Overview

Pharmegic is a healthcare compliance portal built with Next.js (App Router), TypeScript, TailwindCSS, Supabase, PostgreSQL, and React. The application supports two main user experiences:

- **Admin portal**: Manage clients, chemicals, TCC applications, certificates, branding, approvals, and settings.
- **Client portal**: Submit TCC applications, view authorized substances, review issued certificates, and manage profile-related actions.

The system is designed for pharmaceutical regulatory compliance, including Tonnage Compliance Certificates (TCCs), client onboarding, substance authorization, and certificate generation.

---

## Core Technologies

- Next.js 16
- React 19
- TypeScript
- TailwindCSS v4
- Supabase (Auth + Database + Storage)
- PostgreSQL
- React Query (@tanstack/react-query)
- Zod for validation
- Nodemailer for SMTP email delivery
- @react-pdf/renderer for PDF certificate generation
- Zustand for toast state management

---

## Project Entry Points

- `app/page.tsx` redirects root `/` to `/login`.
- `app/layout.tsx` defines global HTML structure, fonts, and wraps content with `Providers`.
- `components/Providers.tsx` sets up the React Query client and global toast container.

---

## Environment & Configuration

The project depends on environment variables, including:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (implied by `lib/supabase/admin.ts` usage)
- `NEXT_PUBLIC_APP_URL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

The Supabase client is created in two flavors:

- `lib/supabase/client.ts` for browser/client-side actions
- `lib/supabase/server.ts` for server-side pages and server actions with cookies

---

## Authentication Flow

### Login & Sessions

- `actions/auth.ts` contains server actions for:
  - `login` using `supabase.auth.signInWithPassword`
  - `logout` using `supabase.auth.signOut`
  - `forgotPassword` using `supabase.auth.resetPasswordForEmail`
  - `resetPassword` using `supabase.auth.updateUser`

- Authentication metadata includes roles and `client_id` on the Supabase user.
- A separate `users` table is referenced for app-specific user profile roles and management.

### Roles

The application supports at least these roles:

- `MASTER_ADMIN` / admin staff
- `STAFF`
- `CLIENT`

Role-based access is enforced in server actions and page entry logic.

---

## Main Routes & Responsibilities

### Public / authentication pages

- `app/login/page.tsx` — login form page
- `app/forgot-password/page.tsx` — password recovery form
- `app/reset-password/page.tsx` — reset password page
- `app/verify/[certNumber]/page.tsx` — certificate verification page for public certificate validation

### Admin portal pages

- `app/admin/page.tsx` — Admin dashboard with stats and charts
- `app/admin/approvals/page.tsx` — TCC approval queue
- `app/admin/chemicals/page.tsx` — manage chemical inventory and authorizations
- `app/admin/clients/page.tsx` — clients list
- `app/admin/clients/new/page.tsx` — onboarding new clients
- `app/admin/clients/[id]/page.tsx` — view client details
- `app/admin/clients/[id]/edit/page.tsx` — edit client profile and authorizations
- `app/admin/settings/page.tsx` — settings dashboard
- `app/admin/templates/page.tsx` — certificate branding and template management

### Client portal pages

- `app/client/page.tsx` — client dashboard
- `app/client/apply/page.tsx` — TCC application form
- `app/client/certificates/page.tsx` — list of issued certificates
- `app/client/forgot-password/page.tsx` — client password recovery
- `app/client/login/page.tsx` — client login
- `app/client/reset-password/page.tsx` — client password reset

---

## New Client Registration Form Details

The client onboarding form is built in `components/ClientWizard.tsx` and shown under `app/admin/clients/new/page.tsx`.

### Sections and fields

1. **Company Details**
   - `Company Name` — primary customer organization name.
   - `Legal Name` — formal registered business name, optional when same as company name.
   - `Registration Number` — business registration or license identifier.
   - `UUID Number` — optional unique identifier used for internal or government tracking.
   - `Owner / Company Representative` — company representative name for the client profile.

2. **Primary Person**
   - `First Name` and `Last Name` — primary contact person for the client.
   - `Email Address` — used as the first Supabase auth user email and primary client contact email.
   - `Mobile Number` — used in the client profile for phone contact and notification reference.

3. **Login Credential**
   - `Password` — initial client login password created when the client is onboarded.
   - The password is stored through Supabase Auth during `createClientAction`.

4. **Secondary Person Contact**
   - `First Name`, `Last Name`, `Email`, `Mobile Number`, `Position / Role`.
   - Secondary contacts are optional extra `client_contacts` entries.
   - These contacts support multi-person client communication and can be removed before saving.

5. **Address Details**
   - `Address`, `City`, `State`, `Postal Code`, `Country`.
   - This section captures the client office or billing address information.

### What this form creates

- Writes a `clients` row with the company profile and contact metadata.
- Writes one or more `client_contacts` rows for secondary contacts.
- Sends the client authentication user creation to Supabase Auth with `role: CLIENT` and `client_id` metadata.
- Uses the primary contact email as the auth login email and the client record email.

### Connections

- `profile.email` → `clients.email` and auth user email.
- `primary_contact_first_name` / `primary_contact_last_name` → builds the contact person string on the client profile.
- `contacts` → `client_contacts` additional contact records.
- `authorizedChemicalIds` is part of the payload structure and is intended to link chemical authorizations through `client_chemicals`.

---

## Chemical Registry / Substance Form Details

Chemicals are managed in `components/ChemicalsDashboard.tsx` and through `actions/chemicals.ts`.

### Chemical form fields

- `chemical_name` — substance name used in TCC applications and reporting.
- `cas_number` — unique chemical CAS registry number used for identification.
- `ec_number` — optional EC registration number for the substance.
- `tonnage_band` — regulatory tonnage band or volume category.
- `validity_date` — substance validity expiry date.
- `available_quantity` — remaining quota available for client TCC applications (MT).
- `status` — active/inactive state for whether the substance may be used.

### What this form affects

- Active chemicals appear in the admin registry and can be authorized for clients.
- Client dashboard quota cards use `available_quantity` and exported totals.
- TCC applications validate requested quantity against chemical quota.
- Certificate generation includes `chemical_name`, `cas_number`, `ec_number`, and tonnage details.

### Connections

- `chemicals` table connects to `client_chemicals` for authorized client access.
- `chemicals` table connects to `tcc_applications` to validate substance eligibility.
- `chemicals` table connects to `certificates` through approved applications.

---

## TCC Application Form Details

The client TCC application form is implemented in `components/TccApplicationForm.tsx` and submitted via `actions/tcc.ts`.

### Form fields

- `Chemical Substance` — select from authorized substances for the logged-in client.
- `Export Tonnage (Metric Tons - MT)` — requested quantity, validated as a positive number.
- `KKDIK Registration Number` — export registration identifier required by the application.
- `Expected Export Shipment Date` — shipment date used to validate against substance validity.

### What this form validates

- The selected chemical must be authorized for the client via `client_chemicals`.
- Requested tonnage must not exceed the selected chemical's `available_quantity`.
- Export date must be present and not exceed the substance `validity_date`.

### Connections

- Selected substance ID ties to `client_chemicals` and `chemicals`.
- On approval, the chemical quota `available_quantity` is decremented.
- Approved applications create a `certificates` record linked to the client and chemical.
- Notifications and emails are sent to the client contact email from the client profile.

---

## Data Services Layer

### `services/db.ts`

This file centralizes most database interactions and is the main backend service layer.

Key responsibilities include:

- `getAdminDashboardStats` — fetch admin KPI counts, active certificates, pending TCC applications, renewal alerts, and monthly reports.
- `createClientWizard` — create a new client organization, insert company profile, contacts, and substance authorizations.
- `getClients` — search and paginate clients.
- `updateClient` — update client profile, contacts, and chemical authorizations.
- `deleteClient` — delete client data and dependents.
- `getChemicals` — load chemicals inventory and filter by status.
- `getTccApplications` — fetch TCC applications with certificate relations.
- `processTccApplication` — approve/reject/modification flow, update chemical quantities, create certificates, and insert audit logs.
- `getClientDashboardStats` — compute client-specific stats, authorized substances, certificates, and notifications.

### `services/email.ts`

- Responsible for sending emails through Nodemailer.
- Uses SMTP settings when configured.
- Fallback behavior is log-only when SMTP is not configured.
- Sends HTML email content generated by `emails/templates.ts`.

### `services/pdf.tsx`

- Generates PDF documents for TCC certificates using React PDF renderer.
- Builds certificate content from branding, client details, chemical details, issue/expiry data, and generated certificate number.

---

## Validation Logic

### `lib/validations/index.ts`

Contains `zod` schemas for:

- Login and password flows
- Chemical records
- Client onboarding/wizard data
- TCC application payloads

It ensures request payloads are validated before database operations occur.

---

## Action Handlers

### `actions/auth.ts`

- Authentication actions called from client forms.
- Handles sign-in, logout, forgot password, reset password.
- Syncs role metadata between Supabase auth and the `users` table.

### `actions/clients.ts`

- Create/update/delete client actions.
- Uses `createAdminClient()` for privileged Supabase operations.
- Validates admin/staff permissions.
- Manages email address changes, auth user updates, invite resend flows, and client deletion.

### `actions/tcc.ts`

- `applyForTccAction` for client TCC application submissions.
  - Validates authorized chemical assignment
  - Checks inventory quota
  - Inserts `tcc_applications`
  - Logs audit events

- `processTccAction` for admin approval processing.
  - Approves or rejects applications
  - Generates certificate number
  - Builds and uploads certificate PDFs
  - Creates certificate records
  - Sends notifications and emails

---

## UI / Component Structure

### Shared UI

- `components/ui/*` — design system primitives like `Button`, `Card`, `Dialog`, `Input`, `Select`, `Badge`.
- `components/Sidebar.tsx` — main navigation menu for admin/client portals.
- `components/Breadcrumbs.tsx` — route breadcrumbs for context.
- `components/ToastContainer.tsx` — toast messages displayed globally.

### Domain pages/components

- `components/AdminDashboard.tsx` — admin KPIs and charts.
- `components/ClientsDashboard.tsx` — client list, edit/delete actions, onboarding helpers.
- `components/ClientDashboard.tsx` — client home stats, certificate list, authorized substances.
- `components/TccApplicationForm.tsx` — client-facing TCC application UI.
- `components/CertificatesList.tsx` — certificate list view.
- `components/ChemicalsDashboard.tsx` — manage chemical inventory and enable authorization.
- `components/BrandingDashboard.tsx` — certificate branding editor.
- `components/SettingsDashboard.tsx` — system-level settings.

---

## Data Flow Summary

1. **User visits a page**
   - Private pages authenticate user via Supabase session.
   - `app/client/*` and `app/admin/*` pages call `lib/supabase/server` directly for server-side data fetch.

2. **Client submits forms**
   - Client forms call server actions from `actions/*`.
   - Input is validated through Zod schemas in `lib/validations`.
   - Authorized users create/update data via `services/db.ts`.

3. **TCC workflow**
   - Client submits TCC application (`actions/tcc.ts`).
   - Admin processes application, generates PDF, updates certificates, sends notifications and email.
   - Certificate verification page exposes public validation of certificate details.

4. **Admin portal management**
   - Admin pages use service functions to load clients, chemicals, approvals, and settings.
   - Admin actions may update Supabase auth user info and store user metadata.

---

## Key Files to Know

- `app/layout.tsx` — global app shell
- `app/page.tsx` — redirects into login
- `app/admin/*` — admin portal
- `app/client/*` — client portal
- `actions/auth.ts` — login/reset password
- `actions/clients.ts` — client lifecycle actions
- `actions/tcc.ts` — TCC application workflow
- `services/db.ts` — main database access layer
- `services/email.ts` — email delivery and logging
- `services/pdf.tsx` — certificate PDF generator
- `lib/supabase/client.ts` — client-side Supabase
- `lib/supabase/server.ts` — server-side Supabase
- `lib/validations/index.ts` — payload validation schemas
- `emails/templates.ts` — HTML email templates

---

## How to Run

1. Install dependencies:
   ```bash
   npm install
   ```
2. Set required environment variables in `.env`.
3. Start development server:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:3000`.

---

## Notes

- The app supports both SMTP email delivery and fallback logging when SMTP is missing.
- PDF certificates are generated server-side and uploaded to Supabase storage.
- User role enforcement happens in server action logic and route server components.
- Many admin operations rely on a Supabase service-role client imported from `lib/supabase/admin.ts`.

If you want, I can also add a shorter `README` summary or expand this into a dedicated `docs/architecture.md` file.