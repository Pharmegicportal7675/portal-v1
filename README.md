# portal-v1 — Pharmegic Portal (Live)

Production app for **portal.pharmegichealthcare.com** — Hostinger Node.js + **MySQL only**.

## Stack

- Next.js 16 + TypeScript + Tailwind
- **MySQL** (Hostinger) + Prisma (`lib/db/query-client.ts`)
- Local file storage (`public/uploads/certificates/`)
- SMTP2GO (unchanged)
- Custom JWT auth

## Local development

```bash
npm install
npm run dev
```

## Environment (`.env.local`)

```env
DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/DATABASE
SMTP_HOST=mail.smtp2go.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=Pharmegic Healthcare <noreply@pharmegichealthcare.com>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Hostinger deploy (auto via GitHub push)

| Setting | Value |
|---------|-------|
| Install | `npm ci` |
| Build | `npm run build` |
| Start | `npm run start` |
| Node | 22.x |
| Output | `.next` |

**Env vars in hPanel:** `DATABASE_URL`, `SMTP_*`, `NEXT_PUBLIC_APP_URL`

## Database

```bash
npm run db:import          # create tables (first time)
npx tsx scripts/seed-admins.js   # seed admin logins
```

See `deployment.md` for full Hostinger setup.
