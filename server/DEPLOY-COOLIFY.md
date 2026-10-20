# Deploying to Coolify (Hetzner)

Coolify is a self-hosted PaaS. Running it on a Hetzner ARM box gives you a
web service + a free scheduled task for the scraper, without Render's
free-tier limitations (sleeping service, paid cron, 30-day DB expiry).

## 1. Provision the server

Create a Hetzner **CX33** (x86, 4 vCPU / 8 GB RAM) with Ubuntu 24.04. (An ARM
**CAX21** is equivalent and cheaper when in stock — the Docker image is
multi-arch, so either works. CX is the fallback when Ampere/CAX is sold out.)

## 1b. Harden the box FIRST

Before installing anything public-facing, run the baseline hardening and set up
Tailscale — see **[HARDENING.md](HARDENING.md)**. In particular, Coolify's
dashboard must be reached over Tailscale, never exposed publicly.

## 2. Install Coolify

SSH in (over Tailscale, as the `deploy` user after hardening) and run:

```
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

Once it finishes, open the dashboard over Tailscale at
`http://<tailscale-ip>:8000` (NOT the public IP) and create the admin user.

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

## Known issue: river (PNA) data from a datacenter IP

The Prefectura Naval Argentina source (`contenidosweb.prefecturanaval.gob.ar`)
appears to restrict access from non-Argentine / datacenter IPs. Confirmed on
Render: news (argentina.gob.ar) and weather (Open-Meteo) scrape fine from the
datacenter, but **river-level requests to PNA return no usable data**
(`/river/:id` → `no data yet`, `/refresh` → `river.updated: 0`). PNA responds
normally from an Argentine residential IP, which is how the original mobile app
(scraping from users' phones) always worked.

**Hetzner will NOT fix this** — it is also a datacenter (EU/US IPs, no Argentine
region). Expect the same river gap on any cloud host. This is orthogonal to the
deploy platform and must be solved separately. Options under consideration:
- Route only the PNA fetches through a proxy with an Argentine IP.
- Keep river-level fetching on the client (as the original app did) and use the
  backend for news + weather + device analytics + shared cache.
- Run a small scraper from an Argentine-based machine that POSTs to `/refresh`.

Until this is resolved, a datacenter deploy serves working news + weather +
device analytics, but river level will be empty.


## 10. Feedback: owner email and the tailnet-only admin

**Release status: local implementation only.** No DNS, Resend sends, secrets,
role changes, deployments, port mappings, or external reachability checks were
performed. Every operation below requires the owner's explicit approval. Do not
release the app until the unchecked verification gates have evidence.

### Environment variables (application → Environment Variables)

| Variable | Value | Notes |
|---|---|---|
| `RESEND_API_KEY` | `re_…` (sending access, restricted to `rioparana.com.ar`) | Missing → owner email disabled, logged at startup |
| `FEEDBACK_NOTIFY_EMAIL` | `garassino@gmail.com` | Default if unset |
| `FEEDBACK_FROM_EMAIL` | `Paraná Info <avisos@rioparana.com.ar>` | Default if unset; domain must be verified in Resend |
| `ADMIN_BASE_URL` | `http://100.89.213.31:3100` | Used for links in the email |
| `ADMIN_PASSWORD_HASH` | output of the command below | Tick **Is Literal** — the hash contains `$`, which compose would interpolate. Missing/malformed → admin disabled, logged |
| `ADMIN_PORT` | `3100` | Default if unset |
| `ADMIN_SECURE_COOKIE` | `false` (`true` only with the Traefik fallback below) | |
| `LOG_LEVEL` | `info` | |
| `RUN_MIGRATIONS` | `false` for the restricted runtime | Default `true` preserves existing installs; run the separate migration job first |
| `LEGACY_DEVICE_ROUTES` | `on` | `off` once `/stats` → `auth.shareOfActive` ≥ 0.9 |

Generate the hash on your machine (the password is read from stdin, never from argv):

```bash
cd server && read -rs PW && printf '%s\n' "$PW" | npx tsx src/admin/hashPassword.ts; unset PW
```

### Resend domain (Cloudflare DNS)

1. Resend → Domains → Add `rioparana.com.ar`, region `us-east-1`.
2. Cloudflare → DNS for `rioparana.com.ar`: copy the exact DKIM, SPF and MX names/values currently issued by Resend for this domain/region. Do not invent or reuse records from another project. Confirm DNS-only where applicable and preserve any existing SPF/DMARC policy.
3. Optional but recommended: TXT `_dmarc` → `v=DMARC1; p=none;`.
4. Resend → Verify. Wait until DKIM and SPF are both "Verified".
5. Resend → API Keys → create one with **Sending access** limited to `rioparana.com.ar`; put it in `RESEND_API_KEY`.
6. Smoke test from your machine:
   ```bash
   curl -s https://api.resend.com/emails -H "Authorization: Bearer $RESEND_API_KEY" -H 'Content-Type: application/json' \
     -d '{"from":"Paraná Info <avisos@rioparana.com.ar>","to":["garassino@gmail.com"],"subject":"Paraná Info: prueba","text":"ok"}'
   ```
   Expect `{"id":"…"}` and the email in the inbox (not spam).

### Publishing port 3100 on the tailnet only

The admin listens on `0.0.0.0:3100` **inside** the container. Who can reach it is decided by the Docker port mapping. Docker writes its own iptables rules and **bypasses ufw**, so a plain `3100:3100` mapping would be public (only the Hetzner Cloud Firewall would stand in the way). Bind the host side to the tailnet address instead:

1. Application → Configuration → Network:
   - **Ports Exposes:** `3000,3100`
   - **Ports Mappings:** `100.89.213.31:3100:3100`
2. Traefik keeps routing only the domain to port 3000; do not add any label or domain for 3100.
3. Redeploy.

### Verification checklist (all must hold before the app release)

- [ ] On the host: `sudo ss -ltnp | rg 3100` shows `100.89.213.31:3100` and **not** `0.0.0.0:3100` or `[::]:3100`.
- [ ] From a tailnet device: `curl -si http://100.89.213.31:3100/admin/login | head -1` → `HTTP/1.1 200 OK`; the login page renders in a browser and login works.
- [ ] From a non-tailnet network (phone hotspot with Tailscale **off**): `curl -m 5 -si http://178.105.89.240:3100/admin/login` → times out / connection refused.
- [ ] From the same non-tailnet network: `curl -si https://api.rioparana.com.ar/admin/login -H "x-api-key: $APP_API_KEY" | head -1` → `404`.
- [ ] From the non-tailnet network: `nmap -Pn -p 3100 178.105.89.240` → `filtered` or `closed`.
- [ ] Startup logs show `[admin] listening on 3100 (tailnet only)` and, if the key is set, no `owner email disabled` line.

### Fallback if Coolify cannot bind a host IP: Traefik `ipAllowList`

Only if the mapping above is rejected or `ss` shows `0.0.0.0:3100`. Remove the port mapping and add these **Container Labels** to the application:

```
traefik.http.routers.rp-admin.rule=Host(`api.rioparana.com.ar`) && PathPrefix(`/admin`)
traefik.http.routers.rp-admin.entrypoints=https
traefik.http.routers.rp-admin.tls=true
traefik.http.routers.rp-admin.priority=100
traefik.http.routers.rp-admin.service=rp-admin
traefik.http.routers.rp-admin.middlewares=rp-admin-tailnet
traefik.http.services.rp-admin.loadbalancer.server.port=3100
traefik.http.middlewares.rp-admin-tailnet.ipallowlist.sourcerange=100.64.0.0/10
```

Do **not** set an `ipStrategy`: the allow-list must judge the TCP peer, never `X-Forwarded-For`, or anyone behind Cloudflare could claim a tailnet address. Set `ADMIN_SECURE_COOKIE=true` and `ADMIN_BASE_URL=https://api.rioparana.com.ar`. The owner reaches it over the tailnet by adding `100.89.213.31 api.rioparana.com.ar` to the laptop's hosts file. Verify: from the tailnet the login page loads over HTTPS; from a non-tailnet network `https://api.rioparana.com.ar/admin/login` → `403` (Traefik's answer; accepted for the fallback).

### Audit table: insert and select only

The spec wants the app role unable to change `admin_audit`. Check which role the app uses:

```sql
SELECT current_user, rolsuper FROM pg_roles WHERE rolname = current_user;
```

If `rolsuper` is true, grants cannot restrict it. A table owner can also bypass
ordinary revocations. Do not claim append-only protection until the runtime
role is neither superuser nor owner of `admin_audit`, cannot assume its owner's
role, and has only `SELECT` and `INSERT` on that table (plus sequence usage).
Use a generated secret; no password is supplied in this document.

### Separate privileged migrations from restricted runtime

The implementation now supports this separation; it was exercised on an owned,
disposable real PostgreSQL cluster, not on the deployment database:

1. Build once (`npm run build` in `server`). In an explicitly approved migration
   job, supply its owner/migration-role `DATABASE_URL` through the secret store
   and run `npm run migrate`. The job needs no `APP_API_KEY` and closes its pool.
2. Give the runtime a different, nonowner/non-superuser `DATABASE_URL` and set
   `RUN_MIGRATIONS=false`. Startup performs SELECT-only required-schema checks,
   not CREATE/ALTER; missing feedback columns fail startup rather than serving
   a partial schema. Keep migration credentials out of the runtime container.
3. Grant the runtime DML on app tables, SELECT/INSERT only on `admin_audit`, and
   required sequence usage. No schema CREATE, role membership in an owner, or
   audit table ownership. Review actual inherited/default privileges separately.
4. Repeat the migration job before each schema-changing deployment. Do not
   switch the runtime flag on to bypass a failed migration or missing grant.

The default remains `RUN_MIGRATIONS=true` for backwards compatibility; that is
not append-only audit hardening. Production must explicitly adopt the separate
job and restricted role after owner approval. No deployment roles or credentials
were changed by local implementation/tests.

- [ ] Owner approves the migration/runtime-role separation and credentials.
- [ ] Deployed Postgres fresh/existing-schema migration verified with its actual migration role (disposable local PostgreSQL passed).
- [ ] Deployed restricted runtime starts with `RUN_MIGRATIONS=false`, following its separate migration job (disposable local role test passed).
- [ ] As the runtime role, SELECT/INSERT audit succeeds; UPDATE, DELETE and
  TRUNCATE are denied. Confirm table ownership and inherited memberships too.
- [ ] A container built from `server/Dockerfile` loads native argon2 and hashes
  a disposable test password. This is not verified by the host-native tests.

### Rollout gates (not executed)

1. After review and explicit owner approval, deploy Phase 0 with legacy routes
   still on; verify health, one-time registration, legacy compatibility and log
   redaction. Do not push or deploy automatically.
2. Configure verified Resend sender, private admin mapping, literal argon2 hash,
   and the approved separate migration job and runtime role; obtain approval for Phase
   1+2 deployment. Run every reachability check above from both networks.
3. With approval, run the send → email → private admin reply → app thread
   smoke test using dedicated test data. This sends real email/push; local
   automated tests use injected transports instead.
4. Release app 2.2.0 only after backend gates, privacy/Data Safety updates and
   device E2E are verified. Publishing requires separate owner approval.
5. Keep legacy routes on until `/stats` reports `auth.shareOfActive >= 0.9`
   for seven consecutive days. Ask for approval before changing
   `LEGACY_DEVICE_ROUTES=off` and redeploying; verify all three routes return 410.

### Transition compatibility

While `LEGACY_DEVICE_ROUTES=on`, old devices without a registered credential
retain legacy ping, push-token and notification access. Once a device registers,
all three legacy endpoints reject it with `401 {"error":"invalid_token"}` even
if supplied with the bundle API key; upgraded clients must use `/me/*` with their
Bearer. The registration and legacy guard share a database row-lock boundary,
so a queued legacy write cannot override the upgrade after it commits. TOFU
re-registration still returns 409; a lost-token reinstall uses a fresh device ID.

### Durable owner-email acknowledgement

`owner_emailed_at` acknowledges only exact device-message IDs selected for an
accepted email, atomically with its debounce state. Equal-timestamp or older
late commits stay pending. A failure before acceptance leaves all pending;
a crash after external acceptance but before DB commit can resend (at-least-once),
not silently skip. Existing timestamp marks are retained for diagnostics only,
not used to discard unacknowledged messages. On an upgrade from timestamp-only
code, previously sent unacknowledged messages may be announced once again.
