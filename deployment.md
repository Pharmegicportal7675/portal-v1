# Pharmegic Healthcare Portal — Deployment Guide (Hostinger)

Production app: **portal.pharmegichealthcare.com**

---

## 1. Production Checklist

### Database
- **MySQL only** on Hostinger (`DATABASE_URL` in hPanel).
- No Supabase — all data is in MySQL via Prisma.
- Certificate files are stored locally under `public/uploads/certificates/`.

### Security
- `DATABASE_URL` must **never** be exposed in client-side code — server actions and API routes only.
- Custom JWT auth (`lib/auth/session.ts`) — not Supabase Auth.

### SMTP
- Production SMTP2GO credentials in hPanel (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`).
- Ensure SPF, DKIM, and DMARC are configured on your sending domain.

---

## 2. Hostinger Node.js Deploy (GitHub)

| Setting | Value |
|---------|-------|
| Install | `npm ci` |
| Build | `npm run build` |
| Start | `npm run start` |
| Node | 22.x |
| Output | `.next` |

### Required environment variables (hPanel)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | MySQL connection string |
| `SMTP_HOST` | `mail.smtp2go.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | SMTP2GO username |
| `SMTP_PASS` | SMTP2GO password |
| `SMTP_FROM` | Sender address |
| `NEXT_PUBLIC_APP_URL` | `https://portal.pharmegichealthcare.com` |

After changing `NEXT_PUBLIC_*` vars, **redeploy** the app.

### RC HTML Certificate PDF (Puppeteer)

On Hostinger VPS with Chrome installed, set:

```
PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
```

Verify: `https://portal.pharmegichealthcare.com/api/health/pdf-converter`

---

## 3. Database Setup

First deploy:

```bash
npm run db:import
```

Seed admin users (local or SSH):

```bash
npx tsx scripts/seed-admins.js
```

### Audit logs

```sql
SELECT u.email, a.action, a.entity_type, a.created_at
FROM audit_logs a
JOIN users u ON a.user_id = u.id
ORDER BY a.created_at DESC;
```
