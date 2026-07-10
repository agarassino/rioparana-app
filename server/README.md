# rioparana-server

Backend for the Río Paraná app. Fastify + Postgres.

## Local dev
1. `npm install`
2. Copy `.env.example` to `.env` and fill values (a local Postgres URL works).
3. `npm run dev`

## Tests
`npm test`

## Deploy to Railway
1. Create a new Railway project; add a **PostgreSQL** plugin.
2. Add a service from this repo; set **Root Directory** to `server`.
3. Set env vars:
   - `DATABASE_URL` — reference the Postgres plugin's connection string.
   - `APP_API_KEY` — a long random string (the app must send it as `x-api-key`).
   - `PORT` — Railway provides this automatically; the app reads it.
4. Deploy. Railway runs `npm run build` then `npm start`; migrations run on boot.
5. Verify: `GET https://<service>.up.railway.app/health` → `{"status":"ok"}`.
6. Smoke test a protected route with the key:
   `curl -H "x-api-key: <APP_API_KEY>" https://<service>.up.railway.app/news`
