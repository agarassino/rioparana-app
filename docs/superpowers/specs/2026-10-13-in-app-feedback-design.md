# In-app feedback, owner admin, and device auth — design

Date: 2026-10-13
Status: approved in brainstorming, pending written-spec review

## Goal

Let app users send suggestions, bug reports and questions from inside the app,
and let the owner read and answer them from a private admin. Answers come back
inside the app, announced by a push notification. The owner gets an email when
new messages arrive.

Success: a user can report a data error from a station screen in under a
minute, without giving any personal data, and sees the owner's answer in the
same thread; the owner never misses a message and never exposes the admin to the
public internet.

## Non-goals

- Live chat, typing indicators, attachments or images.
- Email or WhatsApp as a reply channel for users.
- Collecting names, emails or phone numbers from users.
- Opening the app on the locality the user installed from (install referrer):
  separate change.
- The animated splash screen: separate design.

## Constraints and facts this design rests on

- The app's API key ships inside the bundle and must be treated as public.
- `deviceId` is a crypto-random UUIDv4 kept in SecureStore
  (`src/services/deviceId.ts`); it is unguessable but it is not a credential.
- Today `GET /notifications`, `POST /devices/push-token` and
  `POST /devices/ping` trust a client-supplied `deviceId` behind the public key.
  Anyone who learns another device's id can read its notification history or
  replace its push token (security review, 2026-10-11).
- Backend: Fastify 4 + Postgres on Coolify/Hetzner behind Traefik, public at
  `api.rioparana.com.ar`. The host is on the owner's tailnet (Coolify is
  reached at `100.89.213.31`).
- `logger: false` in `server/src/server.ts`: nothing is logged today.
- `npm audit --omit=dev` in `server/`: 1 critical (`proxy-addr`, client-IP
  spoofing that defeats the IP-keyed rate limit) and 3 high (fastify 4.x,
  `find-my-way`, `fast-uri`).
- Push uses Expo's push service; tokens and the daily digest already exist
  (`server/src/services/dailyPush.ts`, `server/src/stores/pushStore.ts`).
- An in-process scheduler already runs periodic jobs
  (`server/src/scheduler.ts`).
- The owner already has a Resend account (used by another project).

## Phase 0 — Security groundwork (ships first)

### Per-device token

- `POST /devices/register` (behind the public key, rate limited per IP):
  body `{ deviceId }`. The server issues a random 256-bit token, stores only
  its SHA-256 hash (the token is high-entropy, so a slow hash adds nothing),
  and returns the token once.
- Trust-on-first-use: a `deviceId` that already has a token cannot be
  re-registered through this route. A device that loses its token (reinstall)
  generates a new `deviceId`, as it does today.
- The app stores the token in SecureStore and sends
  `Authorization: Bearer <token>` on every device-scoped request.
- Device-scoped routes resolve the device from the token and ignore any
  `deviceId` in the body or query.
- New authenticated versions: `GET /me/notifications`, `PUT /me/push-token`,
  `POST /me/ping`, plus all feedback routes below.
- Transition: the old `deviceId`-param routes stay for app versions < 2.2.0
  until the 2.2.0+ share of active devices (from `/stats`) passes 90 %, then
  they return 410. Until then the existing exposure remains for old versions
  only; ids are unguessable, which bounds the risk.

### Logging and errors

- Enable the Fastify logger (pino) with `redact` for `authorization`,
  `x-api-key`, `x-refresh-token`, cookies, and any `token`/`password` fields.
- A `setErrorHandler` that logs the error and returns a generic body
  (`{ error: 'internal' }`) for 5xx.

### Dependencies and abuse limits

- Upgrade Fastify 4 → 5 and `@fastify/rate-limit` to its matching major;
  `npm audit --omit=dev` must report no high or critical.
- Rate limits: keep the global per-IP limit; add per-device limits keyed on the
  token's device for every write route (numbers in Phase 1).
- Set an explicit `bodyLimit` (16 KB) instead of the implicit 1 MB.

## Phase 1 — Feedback backend

### Data model

```sql
-- Phase 0 adds to the existing devices table:
alter table devices add column token_hash bytea unique null;
alter table devices add column token_issued_at timestamptz null;

feedback_threads (
  id            uuid primary key,
  device_id     uuid not null references devices (device_id),
  kind          text not null check (kind in ('suggestion','bug','question')),
  station_id    text null,           -- set when sent from a station screen
  app_version   text not null,
  os_version    text not null,
  status        text not null check (status in ('open','answered','archived')),
  unread_device boolean not null default false,  -- an admin reply not yet seen
  created_at    timestamptz not null,
  updated_at    timestamptz not null
)

feedback_messages (
  id         uuid primary key,
  thread_id  uuid not null references feedback_threads on delete cascade,
  author     text not null check (author in ('device','admin')),
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null
)

admin_audit (
  id         bigserial primary key,
  action     text not null,          -- login, login_failed, reply, archive
  thread_id  uuid null,
  at         timestamptz not null
)  -- append-only: the app role has INSERT and SELECT only
```

### Device routes (Bearer token)

| Route | Does |
|---|---|
| `POST /feedback` | New thread with its first message: `{ kind, body, stationId?, appVersion, osVersion }` |
| `POST /feedback/:id/messages` | Device adds a message to its own thread; reopens an archived/answered thread as `open` |
| `GET /feedback` | The device's own threads, newest first, with status and `unread` |
| `GET /feedback/:id` | One own thread with its messages; clears `unread_device` |

A thread that belongs to another device returns 404, never 403.

Limits per device: 5 new threads and 30 messages per rolling 24 h; body 1–2000
characters after trimming; `stationId` must be a known station.

### Owner email

- A scheduler job every 5 minutes: if there are device messages newer than the
  last email and at least 15 minutes have passed since that email, send one
  email via Resend to `garassino@gmail.com`.
- From `avisos@rioparana.com.ar` (domain verified in Resend; SPF and DKIM
  records added in Cloudflare DNS).
- Subject: `Paraná Info: N mensaje(s) nuevo(s)`. Body: per thread, kind,
  station, first 140 characters, and the admin URL. Plain text.
- `RESEND_API_KEY` and `FEEDBACK_NOTIFY_EMAIL` from env; missing key disables
  the job with a startup log line instead of crashing.
- A failed send is retried on the next tick; the "last email" mark only moves
  on success.

### Reply push

- On an admin reply: send an Expo push to the thread's device with title
  `Paraná Info`, body `Tenés una respuesta a tu mensaje`, and
  `data: { type: 'feedback_reply', threadId }`. Never the reply text.
- No push token → the reply still lands; the user sees it next time they open
  the screen (the unread dot covers it).

## Phase 2 — Owner admin

- Served by a second Fastify instance in the same process, listening on `ADMIN_PORT` (default 3100), a port
  that Traefik does not route, reachable only over the tailnet at
  `http://100.89.213.31:3100/admin` (WireGuard-encrypted). If the Coolify
  container networking cannot bind it that way, fall back to a Traefik
  `ipAllowList` middleware on `/admin` limited to the tailnet range, verified
  from both a tailnet and a non-tailnet client before release.
- Server-rendered HTML with a template that escapes by default; no client
  framework; no user text ever inserted unescaped.
- Auth: single password, its argon2id hash in `ADMIN_PASSWORD_HASH`.
  Session id in a cookie `HttpOnly; SameSite=Strict; Path=/admin` (plus
  `Secure` if served over HTTPS), sessions stored server-side with 12 h expiry
  and logout. CSRF token on every POST form. Login lockout: 5 failures → 15
  minutes, keyed on the account, not on IP.
- Unknown and unauthorised admin paths return the same 404.
- Security headers on admin responses: CSP `default-src 'self'`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`.
- Screens (mockup: inbox + detail, stacked on mobile):
  - Filters: Sin responder, Respondidos, Archivados, Errores.
  - Detail: thread, kind, station, short device id, app and OS version,
    count of threads from that device.
  - Actions: Reply (sets `answered`, sends the push, audits) and Archive
    without reply (audits).

## Phase 3 — App (release 2.2.0)

- Registration on startup: if no token in SecureStore, call
  `/devices/register`; never block the UI on it; retry later on failure.
- Screen "Contacto y sugerencias" (mockup A): kind chips (Sugerencia, Error,
  Consulta), text box, optional "Sobre: <estación>" chip removable, Send, the
  line "Te respondemos acá. No hace falta mail ni datos personales.", then
  "Mis mensajes" with status pills and a red dot for unread replies.
- Thread screen: bubbles, the owner signs as "Paraná Info", reply box.
- Entry points: a row in Perfil; "¿Ves algo mal en este dato? Avisanos →" on
  each station screen, pre-filling kind Error and the station; a card at the
  end of Inicio: "¿Una idea o un error? Escribinos: leemos todo y te
  respondemos acá en la app."
- Push tap with `type: 'feedback_reply'` opens the thread, cold start included
  (same pattern as the daily notification).
- Store compliance before publishing: Data Safety form (messages and app
  diagnostics collected, linked to the device, not shared), privacy policy
  update with a 12-month retention, after which threads are purged by a
  scheduler job.

## Error handling summary

- Every app call degrades gracefully: a failed send keeps the typed text and
  shows a retry; nothing throws on app start.
- Server validation failures return 400 with a field name, never echoing input.
- Email and push failures never fail the user-facing request.

## Testing

- Server (vitest, TDD): token issue/resolve and re-register refusal; every
  device route rejects missing/foreign tokens and returns 404 for foreign
  threads; limits; email debounce and retry; push payload without reply text;
  admin login, lockout, CSRF rejection, escaping of stored HTML, audit rows.
  Mutation-check the security tests (remove the ownership check, remove CSRF
  validation, remove escaping) and confirm they fail.
- App: component tests for the screens and entry points; deep link handling.
- End to end (Maestro, existing setup): send a message → reply from the admin
  → open the push → see the reply.
- Manual before release: admin unreachable from a non-tailnet network.

## Rollout

1. Phase 0 server deploy (old routes still work).
2. Phase 1 + 2 server deploy; verify admin reachability and email.
3. App 2.2.0 to Play with the compliance updates.
4. Sunset old device routes when 2.2.0+ passes 90 % of active devices.
