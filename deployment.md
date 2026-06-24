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
| Output directory | **leave empty** (do not serve `.next` as static only) |

`server.js` always binds **`0.0.0.0`** — never `process.env.HOSTNAME` (on Linux that is the machine name and causes **503**).

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

**503 on `/api/auth/login` (or every URL)** means the **Node process is not running** — not a wrong password. Build can succeed while the app never starts.

1. hPanel → **Runtime logs** — look for:
   - `DATABASE_URL is not set` → add env var in hPanel, redeploy
   - `Missing .next/BUILD_ID` → build step did not run or output path is wrong
   - `Next.js exited with code` → paste log for debugging
2. **Settings and redeploy** must be:

| Setting | Value |
|---------|-------|
| Install | `npm ci` |
| Build | `npm run build` |
| **Start** | `npm run start -- -p $PORT` |
| **Entry file** | `server.js` |
| **Output directory** | **leave empty** (do not serve `.next` as static only) |

3. **Environment variables** in hPanel (not `.env` files — build logs show `injected env (0)`):
   - `DATABASE_URL` — required at **runtime** (app exits without it)
   - `NEXT_PUBLIC_APP_URL` — `https://portal.pharmegichealthcare.com`
4. After fix → **Save and redeploy** → **Clear cache**
5. Confirm: `https://portal.pharmegichealthcare.com/api/health/db` returns `{"ok":true,...}` before testing login.

### Required environment variables (hPanel)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | MySQL connection string (see below) |
| `NEXT_PUBLIC_APP_URL` | `https://portal.pharmegichealthcare.com` |
| `AUTH_SECRET` | Random secret for JWT sessions (recommended) |

### DATABASE_URL — critical for login on Hostinger

Local dev may use the external host (`srvXXXX.hstgr.io`). **The Node app on Hostinger must use the internal host** from hPanel → Databases → MySQL:

```
mysql://DB_USER:DB_PASSWORD@127.0.0.1:3306/DB_NAME?connection_limit=5&connect_timeout=30
```

Example (use your real password):

```
mysql://u402838766_Pharmegic:Pharmegic1234@127.0.0.1:3306/u402838766_Pharmegic?connection_limit=5&connect_timeout=30
```

Use **`127.0.0.1`** not `localhost` (avoids socket issues on Linux). Password with `@` → `%40`.

**Prisma on Hostinger:** The app uses `engineType = "client"` with `@prisma/adapter-mariadb` (no Rust query engine). This fixes `PANIC: timer has gone away` on shared hosting process limits.

Verify after deploy:

- `https://portal.pharmegichealthcare.com/api/health/db` → should return `{"ok":true,"users":3}` (or your user count).
- Runtime logs should show: `[portal] MySQL connected (N users in database)`.

If login still fails after DB is connected, reset admin passwords once (SSH or local with production `DATABASE_URL`):

```bash
npx tsx scripts/seed-admins.js
```

Default admins: `atul.patoliya@gmail.com` / `directoratulpatoliya@gmail.com` — password `Admin@1234`.

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

On **Hostinger VPS / Linux**, RC HTML→PDF requires **system Google Chrome** (or Chromium):

```bash
# Install Chrome (Ubuntu/Debian example)
wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
sudo sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list'
sudo apt-get update
sudo apt-get install -y google-chrome-stable
```

Set in Hostinger environment variables:

```
PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
```

Verify after deploy:

- `https://portal.pharmegichealthcare.com/api/health/pdf-converter` — `systemChromeFound` should be `true`
- Generated PDFs are cached under `public/uploads/certificates/`.

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
