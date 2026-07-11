# Deploying to Coolify (Hetzner)

Coolify is a self-hosted PaaS. Running it on a Hetzner ARM box gives you a
web service + a free scheduled task for the scraper, without Render's
free-tier limitations (sleeping service, paid cron, 30-day DB expiry).

## 1. Provision the server

Create a Hetzner **CAX21** (ARM64, 4 vCPU / 8 GB RAM) with Ubuntu 22.04 or
24.04. Coolify supports ARM64 natively.

## 2. Install Coolify

SSH in as root on a fresh(ish) server and run:

```
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

Once it finishes, open `http://<server-ip>:8000`, create the admin user.

## 3. Create the project and database

1. In Coolify: **Project → New**.
2. Add a **PostgreSQL** resource (Coolify-managed).
3. Once it's running, copy its **internal** connection string (Coolify
   shows an internal URL reachable only by other resources in the same
   project/network). This becomes `DATABASE_URL` in step 5 — do not use
   the external/public URL.

## 4. Create the application

1. **New Resource → Application**, source = this Git repository.
2. **Build Pack = Dockerfile**.
   - Dockerfile location: `server/Dockerfile`
   - Base Directory: `server`
3. Set the exposed **Port = 3000**.

## 5. Environment variables

On the application, set:

| Variable | Value |
|---|---|
| `APP_API_KEY` | a long random string (the mobile app must send the same value as the `x-api-key` header) |
| `DATABASE_URL` | the **internal** Postgres URL from step 3 |

Do **not** set `PGSSL`. Coolify's internal Postgres network is plaintext,
and `createPool` only enables SSL when `PGSSL=require` or the URL matches
`*.render.com` — leaving it unset is correct here and needs no code change.

## 6. Deploy

Trigger the deploy. Once healthy, set a domain on the application; Coolify
auto-provisions a TLS certificate via Let's Encrypt.

## 7. Scheduled task (the cron — free on Coolify)

In the application's **Scheduled Tasks**, add:

- Command: `node dist/refresh-once.js`
- Frequency: `*/15 * * * *`

This runs the scraper inside the same app container every 15 minutes —
no separate paid cron service, unlike Render.

## 8. Verify

```
curl https://<domain>/health
# {"status":"ok"}

curl -H "x-api-key: <APP_API_KEY>" https://<domain>/river/parana

curl -i https://<domain>/news
# expect 401 without the key
```

## 9. Backups

Enable Coolify's scheduled Postgres backups and point them at a Hetzner
Storage Box or S3-compatible bucket. Don't skip this — there is no
managed-backup safety net like a cloud provider would give you by default.
