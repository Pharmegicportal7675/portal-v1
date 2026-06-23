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
- **Primary:** Admin → Settings → TCC / RC Certificate Email SMTP (MySQL `admin_settings` table).
- **Optional:** `SMTP_*` env vars in hPanel only as fallback if DB fields are empty.
- Ensure SPF, DKIM, and DMARC are configured on your sending domain.

---

## 2. Hostinger Node.js Deploy (GitHub)

| Setting | Value |
|---------|-------|
| Type | **Node.js Apps** (NOT static/PHP website) |
| Install | `npm ci` |
| Build | `npm run build` |
| **Start** | `npm run start -- -p $PORT` |
| Entry file | `server.js` |
| Node | 22.x |
| Output directory | `.next` (Hostinger build artifact path — OK) |

### CRITICAL — if `/login` shows raw text like `:HL[...]` or `0:{"tree":`

The **Node start command is missing or not running**. Hostinger must run `next start`, not only serve build files.

Fix in hPanel → **Settings and redeploy**:

1. **Start command:** `npm run start -- -p $PORT`
2. **Install command:** `npm ci`
3. **Entry file:** `server.js`
4. Click **Save and redeploy**
5. Dashboard → **Clear cache**

Also reconnect GitHub (dashboard shows "Disconnected from GitHub") so future pushes auto-deploy.

### 503 Service Unavailable

The Node process is **not running** or crashed after start.

1. hPanel → **Runtime logs** — read the latest error (build missing, port, database, etc.).
2. **Settings and redeploy** must include:
   - Install: `npm ci`
   - Build: `npm run build`
   - Start: `npm run start` or `npm run start -- -p $PORT`
   - Entry file: `server.js`
3. Confirm **Build** step succeeded (not only deploy).
4. `DATABASE_URL` must be valid MySQL URL (special chars in password URL-encoded, e.g. `@` → `%40`).
5. After fix → **Save and redeploy** → **Clear cache**.

### Required environment variables (hPanel)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | MySQL connection string |
| `NEXT_PUBLIC_APP_URL` | `https://portal.pharmegichealthcare.com` |
| `AUTH_SECRET` | Random secret for JWT sessions (recommended) |

SMTP is **not** required in hPanel if configured in **Admin → Settings** (stored in `admin_settings`).

Optional env fallbacks (only if DB SMTP fields are empty):

| Variable | Description |
|----------|-------------|
| `SMTP_HOST` | `mail.smtp2go.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | SMTP2GO username |
| `SMTP_PASS` | SMTP2GO password |
| `SMTP_FROM` | Sender address |

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
