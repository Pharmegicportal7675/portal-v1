# Pharmegic Healthcare Portal — Deployment Guide

This document describes the checklist and guidelines for deploying the Pharmegic Healthcare Portal to a production environment.

---

## 1. Production Deployment Checklist

### Security Audit
- Ensure that the `SUPABASE_SERVICE_ROLE` environment variable is **never exposed** in any client-side bundle. It must remain exclusively on the server side (`lib/supabase/admin.ts`, actions, API routes).
- Verify that Row Level Security (RLS) is enabled on all tables in Supabase.
- Confirm that RLS policies are active:
  - Clients can only select/insert/update their own organization and certificate data.
  - Public anonymous users can only query the `/verify` route (handled securely through the server using the service role client).

### Storage Policies
- Configure RLS policies on the Supabase Storage **`certificates`** bucket:
  - Public read access (`true` or `public`) so custom officers can load the verification PDFs.
  - Insert/Delete access restricted strictly to the service role (which is used by our server-side approval actions).

### SMTP Server
- Switch your SMTP server from sandboxes (like Mailtrap) to a production-grade provider (such as Amazon SES, SendGrid, Postmark, or Resend).
- Ensure the SPF, DKIM, and DMARC DNS records are fully configured on your custom sending domain to prevent compliance notifications from going into spam.

---

## 2. Deploying to Vercel

The Pharmegic Healthcare Portal is fully compatible with Vercel's edge network.

### Steps to Deploy
1. Push your repository to **GitHub**, **GitLab**, or **Bitbucket**.
2. Connect your Git account to Vercel and create a new project.
3. Select the repository and configure the Next.js framework settings.
4. Add the required production environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE`
   - `NEXT_PUBLIC_APP_URL` (Use your production domain, e.g., `https://compliance.pharmegic.com`)
   - `SMTP_HOST`
   - `SMTP_PORT`
   - `SMTP_USER`
   - `SMTP_PASSWORD`
   - `SMTP_FROM`
5. Click **Deploy**. Vercel will automatically build the Next.js App Router project and allocate serverless routes.

### RC HTML Certificate PDF (Puppeteer on Vercel)

The live RC certificate download uses server-side HTML → PDF via Puppeteer. On Vercel this uses `@sparticuz/chromium` automatically — **do not** set `PUPPETEER_EXECUTABLE_PATH` or `REACH_PDF_RENDER_URL` in Vercel.

**Required Vercel environment variable:**

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_APP_URL` | `https://portal.pharmegichealthcare.com` |

After adding or changing this variable, **Redeploy** the project (required for `NEXT_PUBLIC_*` vars).

**Verify after deploy:**

```
https://portal.pharmegichealthcare.com/api/health/pdf-converter
```

Check that `htmlPdfEnabled` is `true`, `htmlPdfRenderUrl` is your production domain, and `htmlPdfUsesServerlessChromium` is `true`.

**Do NOT set on Vercel:** `REACH_PDF_RENDER_URL`, `PUPPETEER_EXECUTABLE_PATH`, `CHROME_PATH` (these are for VPS/Linux only).

---

## 3. Production Database Backups & Auditing

### Audit Trails
- Every critical action (such as creating applications, approving certificates, revoking clients, or editing substance limits) triggers an entry in the `audit_logs` table.
- Periodically check the audit logs for security assessment:
  ```sql
  SELECT u.email, a.action, a.entity_type, a.created_at
  FROM public.audit_logs a
  JOIN public.users u ON a.user_id = u.id
  ORDER BY a.created_at DESC;
  ```

### Certificate Expiration Alert CRON
- The platform tracks certificate expiration flags. You can set up a daily/weekly database cron schedule or a simple serverless background action to search and alert on certificates expiring within 30 days.
