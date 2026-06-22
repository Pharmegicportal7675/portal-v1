# portal-v1

Pharmegic Portal — Next.js app ready for **Hostinger GitHub deployment**.

## Project structure

```text
portal-v1/
├─ package.json
├─ package-lock.json
├─ next.config.mjs
├─ public/
├─ app/
│   ├─ layout.tsx
│   ├─ page.tsx
│   └─ globals.css
└─ components/
```

`package.json` and `app/` must be at the **repository root**.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Hostinger deployment (GitHub)

1. Push this repo to GitHub (`main` branch).
2. Hostinger hPanel → **Websites** → **Add Website** → **Node.js Apps**.
3. Choose **Import Git Repository** and connect this repo.
4. Use these build settings:

| Setting | Value |
|---------|-------|
| Framework | Next.js |
| Root directory | `/` (repo root) |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Start command | `npm run start -- -p $PORT` |
| Node.js version | **20** |
| Output directory | `.next` |

5. Add environment variables in Hostinger (see `.env.example`).
6. Click **Deploy**.

## Production checklist

- [ ] `npm run build` succeeds locally
- [ ] `npm run start -- -p 3000` runs without errors
- [ ] `node_modules` is **not** committed (in `.gitignore`)
- [ ] Secrets are in Hostinger env vars, not in the repo
