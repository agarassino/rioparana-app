# rioparana-server

Backend for the Río Paraná app. Fastify + Postgres.

## Local dev
1. `npm install`
2. Copy `.env.example` to `.env` and fill values (a local Postgres URL works).
3. `npm run dev`

## Tests
`npm test`

## Deploy

Coolify (self-hosted on Hetzner) is an alternative/preferred option — see
[`DEPLOY-COOLIFY.md`](./DEPLOY-COOLIFY.md).

## Deploy to Render
This repo ships a `render.yaml` Blueprint that provisions everything in one shot:
- a **web service** (`rioparana-api`) running the Fastify API,
- a **cron job** (`rioparana-refresh`) that scrapes river/news data every 15 minutes via `npm run refresh`,
- a **free Postgres** database (`rioparana-db`).

### Steps
1. In the Render dashboard: **New → Blueprint**, point it at this repo. Render reads `server/render.yaml`.
2. Render provisions the database, web service, and cron job automatically. `DATABASE_URL` is wired between them via `fromDatabase`.
3. Set `APP_API_KEY` manually on the web service (Render marks it `sync: false`, so it won't be auto-generated) — use a long random string. The mobile app must send the same value as the `x-api-key` header.
4. Deploy. The web service runs `npm ci && npm run build` then `npm start`; migrations run on boot. The cron job runs the same build, then `npm run refresh` on its schedule.

### Caveats
- **Free web service sleeps** after ~15 minutes of inactivity — the API cold-starts on the next request. This is fine here because the separate cron job keeps the database fresh independent of whether the API is awake.
- **Cron jobs are not free** — Render bills per execution, and may require a workspace with a payment method attached even on low usage.
- **Free Postgres expires after ~30 days.** Plan to upgrade the database plan (or recreate it) before then to avoid data loss.

### Verify
```
curl https://<service>.onrender.com/health
curl -H "x-api-key: <APP_API_KEY>" https://<service>.onrender.com/news
```
