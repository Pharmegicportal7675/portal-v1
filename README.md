# portal-v1

Pharmegic Portal — Next.js app for **Hostinger Node.js Apps** deployment.

## Project structure

```text
portal-v1/
├─ package.json
├─ package-lock.json
├─ next.config.mjs
├─ scripts/start.mjs
├─ public/
├─ app/
│   ├─ layout.tsx
│   ├─ page.tsx
│   └─ globals.css
└─ components/
```

## Local development

```bash
npm install
npm run dev
```

## Hostinger settings (hPanel)

| Setting | Value |
|---------|-------|
| Framework | Next.js |
| Root directory | `./` |
| Branch | `main` |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Start command | `npm run start` |
| Node.js version | **22.x** (or 20.x) |
| Output directory | `.next` |

Do **not** set output directory to `out` — that is only for static export.

### Environment variables

Add in Hostinger → **Environment Variables**:

```
DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/DATABASE
```

Use the exact URL from Hostinger MySQL panel (password special chars must be URL-encoded, e.g. `@` → `%40`).

Local dev: copy `.env.example` to `.env.local` and fill in values. **Never commit `.env.local`.**

## Deploy steps

1. Push latest code to GitHub `main` branch.
2. In Hostinger → **Deployments** → verify **Repository** is connected (not `—`).
3. Click **Redeploy**.
4. If site still fails, check **Runtime logs** (not build logs).
