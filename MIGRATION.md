# Pharmegic Portal — Hostinger MySQL Migration

## Database

- **Provider:** MySQL on Hostinger (`DATABASE_URL`)
- **ORM:** Prisma (`prisma/schema.prisma`)
- **Compatibility layer:** `lib/db/supabase-compat.ts` — existing code keeps `supabase.from()` calls unchanged

## Auth

Custom JWT session (`lib/auth/session.ts`) — **not** Supabase Auth. No auth changes required.

## Storage

Certificate files: `public/uploads/certificates/` (served at `/uploads/certificates/`)

## One-time data migration from Supabase

```bash
# Set SUPABASE_DATABASE_URL (PostgreSQL) and DATABASE_URL (MySQL) in .env
npm run db:migrate-from-supabase
```

## Hostinger deploy settings

| Setting | Value |
|---------|-------|
| Install | `npm ci` |
| Build | `npm run build` |
| Start | `npm run start` |
| Node | 22.x |
| Env | `DATABASE_URL`, `SMTP_*`, `NEXT_PUBLIC_APP_URL` |

## Local dev

```bash
npm install
npm run dev
```
