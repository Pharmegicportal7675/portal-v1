# Pharmegic Healthcare Portal — Setup Guide

This document describes the steps required to configure and run the Pharmegic Healthcare Portal locally and prepare it for production.

---

## 1. Database & Supabase Configuration

### Execute Schema SQL
1. Open your project in the **Supabase Dashboard**.
2. Navigate to the **SQL Editor** tab.
3. Open **`database.sql`** in your editor, copy its contents, paste them into the Supabase SQL Editor, and click **Run**.

> **Important:** `database.sql` is **safe to re-run** — it does **not** drop tables or delete your data. It only creates missing tables/columns and adds seed rows when they do not exist yet.
>
> Use **`database.reset.sql`** only for a **brand-new empty database** in local development. That file deletes all data.

4. This script will create or update:
   - All custom types and enums (`user_role`, `client_status`, `chemical_status`, `tcc_status`, `certificate_status`).
   - The required database tables (`clients`, `users`, `client_contacts`, `chemicals`, `tcc_applications`, `certificates`, `notifications`, `audit_logs`, `templates`, `client_chemicals`).
   - The automated PostgreSQL sync trigger linking `auth.users` to `public.users`.
   - The performance indexes and Row Level Security (RLS) policies.
   - The default branding template and initial chemical inventory for testing.

### Configure Storage Bucket (required for BO uploads & PDF certificates)
1. In the Supabase Dashboard, go to **Storage**.
2. Create a bucket named exactly **`certificates`** (if it does not exist).
3. Set the bucket to **Public** so clients and admins can open uploaded BO files and certificate PDFs.
4. The app will also try to create this bucket automatically on first upload (needs service role key in `.env`).

> If you see **"Bucket not found"** on TCC submit, the `certificates` storage bucket is missing — create it in Supabase Storage as above.

### Chemical Registry trash (if you see error `22P02` on `/admin/chemicals`)
Run this once in the Supabase SQL Editor (also included at the end of `database.sql`):

```sql
DO $$ BEGIN
    ALTER TYPE public.chemical_status ADD VALUE 'trashed';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
```

Without this, the Chemical Registry page may crash and "Move to Trash" will not work.

---

## 2. Environment Variables configuration

Create a `.env.local` file in the root directory and define the following variables:

```ini
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE=your-service-role-key

# Portal Public App URL (used for QR verification links and auth redirects)
NEXT_PUBLIC_APP_URL=http://localhost:3000

# SMTP Email Configuration
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=587
SMTP_USER=your-smtp-username
SMTP_PASSWORD=your-smtp-password
SMTP_FROM="Pharmegic Compliance Portal <noreply@pharmegic.com>"
```

> [!NOTE]
> If the SMTP credentials are not specified, the Nodemailer client will fallback to printing the email invitation link directly to the console during development.

---

## 3. Bootstrapping the Initial MASTER_ADMIN

To log in as the first administrator, you must create a Supabase Auth user with the `MASTER_ADMIN` role metadata. You can do this by executing the following PostgreSQL command in the Supabase SQL editor:

```sql
-- 1. Create a user via Supabase Auth Dashboard or sign up form, then run this to elevate their role:
UPDATE auth.users
SET raw_user_meta_data = jsonb_build_object('role', 'MASTER_ADMIN')
WHERE email = 'directoratulpatoliya@gmail.com';
```

Alternatively, you can sign up a user using the Supabase client-side API inside a scratch script, passing the role metadata:
```typescript
const { data, error } = await supabase.auth.signUp({
  email: 'directoratulpatoliya@gmail.com',
  password: 'Admin@1234',
  options: {
    data: {
      role: 'MASTER_ADMIN'
    }
  }
});
```

---

## 4. Certificate PDF (RC & TCC)

### RC certificates (EU REACH)

RC **preview** and **PDF download** use the HTML certificate template rendered with Puppeteer/Chromium.

- **Vercel:** set `NEXT_PUBLIC_APP_URL` only (uses `@sparticuz/chromium` automatically).
- **Local/VPS:** Chrome or Edge installed, or set `PUPPETEER_EXECUTABLE_PATH`.

### TCC certificates (legacy DOCX)

TCC **PDF download** still uses DOCX→PDF conversion on the server (LibreOffice on Linux/VPS, Word/LibreOffice on Windows).

```bash
# Ubuntu / Debian
sudo apt-get update && sudo apt-get install -y libreoffice-writer
soffice --version
```

Restart the app after install.

### Windows development

Microsoft Word or LibreOffice on the machine is used automatically for TCC PDF generation.

### EU REACH RC Certificate template

Design source (edit in Word):

```text
templates/source/EU_REACH_SOURCE.docx
```

Prepare runtime templates and Settings preview PDF:

```bash
node scripts/prepare-eu-reach-template.mjs
node scripts/generate-eu-reach-preview-pdf.mjs
```

This writes:

- `templates/EU_REACH_main.docx` — used for all client PDFs/DOCX and Settings preview
- `public/previews/eu-reach-certificate-sample.pdf` — Settings preview fallback PDF

### TCC Certificate template

TCC certificates are rendered from HTML (`components/TccCertificateHtmlDocument.tsx`) and exported to PDF via Puppeteer. Branding (logo, signature, accent color, footer) is configured in **Admin → Settings → TCC Certificate Template**.

Reference design file: `templates/TCC Final.docx` (layout reference only; not used at runtime).

---

## 5. Running the Application locally

1. Install project dependencies:
   ```bash
   npm install
   ```
2. Run the local Next.js development server:
   ```bash
   npm run dev
   ```
3. Open your browser and navigate to `http://localhost:3000`.
4. Log in using your registered credentials.
