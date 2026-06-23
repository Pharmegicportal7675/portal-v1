# Pharmegic Portal — Hostinger MySQL

## Database

- **Provider:** MySQL on Hostinger (`DATABASE_URL`)
- **ORM:** Prisma (`prisma/schema.prisma`)
- **Query client:** `lib/db/query-client.ts` — chainable `.from()` API used across the app

## Auth

Custom JWT session (`lib/auth/session.ts`). No external auth provider.

## Storage

Certificate files: `public/uploads/certificates/` (served at `/uploads/certificates/`)

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
npm run db:import   # first time only
npm run dev
```

## Admin seed

```bash
npx tsx scripts/seed-admins.js
```
