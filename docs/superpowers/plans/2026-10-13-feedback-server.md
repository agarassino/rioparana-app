# In-app Feedback — Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every app install a per-device credential, harden the API (Fastify 5, logging, limits), and add the feedback API, owner email, reply push and a tailnet-only owner admin.
**Architecture:** The existing Fastify app in `server/` gains a token-authenticated device scope (`/me/*`, `/feedback*`) next to the legacy `deviceId` routes, which stay until 2.2.0+ passes 90 % of active devices. Feedback lives in three new Postgres tables written by small store modules; a 5-minute in-process job sends the owner a debounced Resend email and purges threads older than 12 months. A second Fastify instance in the same process serves a server-rendered, escape-by-default admin on `ADMIN_PORT`, published by Docker only on the tailnet IP.
**Tech Stack:** Node 20, TypeScript (ESM), Fastify 5, @fastify/rate-limit 10, @fastify/cookie 11, @fastify/formbody 8, @node-rs/argon2, zod 3, pg, vitest 2 + pg-mem 3, Expo push API, Resend HTTP API, Coolify/Traefik on Hetzner.
**Spec:** docs/superpowers/specs/2026-10-13-in-app-feedback-design.md

## Global Constraints

- All commands run from `server/` unless a step says otherwise (`cd /Users/agustingarassino/workspace/agarassino-productos/rioparana-app/server`).
- Code, identifiers, comments and tests in English; owner-facing admin copy and email in Spanish exactly as written in this plan; user-facing push copy exactly `Paraná Info` / `Tenés una respuesta a tu mensaje`.
- Conventional commits, one commit per task, no `Co-Authored-By` or any AI attribution line. Stage only the files the task lists (another session may be committing landing changes to `main`).
- Old app versions (< 2.2.0) must keep working after every deploy: `POST /devices/ping`, `POST /devices/push-token`, `GET /notifications` stay until `LEGACY_DEVICE_ROUTES=off`.
- Device token: 256 random bits (`randomBytes(32)` → base64url, 43 chars); only its SHA-256 is stored (hex `text`, see Spec Deviations); trust-on-first-use: a `deviceId` that has a token is never re-issued one (409).
- Device-scoped routes take the device from `Authorization: Bearer <token>` only; any `deviceId` in body/query is ignored. Missing/unknown token → 401 `{ "error": "invalid_token" }` (distinct from the API-key 401 `{ "error": "unauthorized" }`).
- A thread that belongs to another device → 404 `{ "error": "not_found" }`, never 403. Non-UUID ids → same 404.
- Feedback limits per device per rolling 24 h (computed from the request clock, `created_at > now - 24h`, UTC instants, no calendar days): 5 new threads, 30 device messages (first messages count). Over limit → 429 `{ "error": "limit", "limit": "threads" | "messages" }`.
- Message body: trimmed, 1–2000 Unicode code points (`[...s].length`, matching Postgres `char_length`), no `\u0000`. Validation failures → 400 `{ "error": "invalid", "field": "<name>" }`, never echoing input.
- `stationId` must be a known station (`getStationById`). `appVersion` matches `^\d{1,3}\.\d{1,3}\.\d{1,3}$`; `osVersion` matches `^[A-Za-z0-9 ._-]{1,40}$`.
- `bodyLimit` 16 KB on both Fastify instances; `POST /river` alone gets 64 KB (a 200-reading crowd batch is ~34 KB).
- Per-device request-rate limit on every device write route: 60/minute keyed on the token hash; `POST /devices/register`: 10/hour per IP. Global per-IP limit (120/minute) stays.
- Logger: pino via Fastify with `redact` for `authorization`, `x-api-key`, `x-refresh-token`, cookies, `set-cookie`, and `token` / `password` / `pushToken` fields. 5xx bodies are always `{ "error": "internal" }`.
- Owner email: job tick every 5 minutes; sends only if there are device messages newer than the last successful email's mark AND ≥ 15 minutes since that email; mark moves only on success. To `FEEDBACK_NOTIFY_EMAIL` (default `garassino@gmail.com`) from `FEEDBACK_FROM_EMAIL` (default `Paraná Info <avisos@rioparana.com.ar>`). Subject `Paraná Info: N mensaje(s) nuevo(s)`. Plain text, per thread: kind, station, first 140 characters, admin URL. Missing `RESEND_API_KEY` disables the job with a startup log line.
- Reply push: title `Paraná Info`, body `Tenés una respuesta a tu mensaje`, `data: { type: 'feedback_reply', threadId }`. Never the reply text. No token → reply still lands.
- Retention: threads whose `updated_at` is older than 12 months are deleted (messages cascade), checked once per 24 h by the same job.
- Admin: `ADMIN_PORT` default 3100, reached at `http://100.89.213.31:3100/admin/login`; argon2id hash in `ADMIN_PASSWORD_HASH`; cookie `admin_session` `HttpOnly; SameSite=Strict; Path=/admin` (+ `Secure` when `ADMIN_SECURE_COOKIE=true`); server-side sessions, 12 h expiry, logout; CSRF token on every POST form; lockout 5 failures → 15 minutes, keyed on the single account (not IP); unknown, unauthorised and CSRF-failing requests all return the same 404 page; headers `Content-Security-Policy: default-src 'self'`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`.
- Admin HTML is built only with the `html` tagged template (escapes every interpolation; there is no raw/unsafe escape hatch).
- `admin_audit` is append-only (`login`, `login_failed`, `reply`, `archive`); no code path updates or deletes it.
- `npm audit --omit=dev --audit-level=high` must exit 0 after Task 1 and at the end of the plan.
- Deploys only with the owner's explicit OK, via `~/.hermes/scripts/deploy-coolify.sh t7uqevsj5bex092bqtxqdx86 --watch`.
- Security tests get a MUTATION-CHECK step: break the guarded line, see the test fail, restore from the backup copy, see it pass.

## Review Focus

Five input classes the spec implies but that no happy-path test would hit; each has a named test in its owning task.

1. **Multi-byte and hostile text** — 2000 emoji (4000 UTF-16 units) must be accepted, 2001 code points rejected with `field: "body"`, whitespace-only rejected, `\u0000` rejected with 400 (real Postgres would 500; pg-mem silently accepts it). Tests: Task 9 `validation.test.ts`, Task 10 "accepts 2000 emoji and rejects a NUL byte".
2. **Double submit / network retry** — the same device body re-posted within 60 s returns the existing thread/message with 200 instead of creating a second one; an admin double-click on Reply stores one message and sends one push. Tests: Task 10 "a retried POST returns the first thread", Task 18 "a double-submitted reply stores one message and sends one push".
3. **Token present but device gone / malformed auth** — a well-formed token whose device row was deleted, `bearer` in lower case, extra spaces, or a token of the wrong length → 401 `invalid_token`, never 500; a non-UUID thread id → 404, never a pg cast error. Tests: Task 4 `requireDevice.test.ts`, Task 10 "returns 404 for a non-uuid id".
4. **Reply push without a deliverable token** — no push token → reply stored and no Expo call; `DeviceNotRegistered` → token cleared; Expo 5xx or network throw → reply stored, admin redirected, nothing thrown. Tests: Task 11 `replyPush.test.ts`, Task 18 "a reply to a device without a push token still lands".
5. **Stored HTML/script rendered in the admin** — `<script>`, quotes and `&` in bodies, previews and metadata render escaped in inbox and detail; there is no unescaped path. Tests: Task 14 `html.test.ts` (+ mutation check), Task 17 `views.test.ts`, Task 18 "renders a stored script tag as text" (+ mutation check).

Also spec-mandated and easy to get wrong, covered explicitly: the 24 h window boundary (Task 10 "frees a slot exactly 24 h later"), Resend down for hours (Task 12 "one email after six hours of failures, capped at 20 threads").

---

## API Contract (consumed by the app plan `2026-10-13-feedback-app.md`)

All routes below also require `x-api-key: <APP_API_KEY>` (the public key) — missing/wrong key → 401 `{ "error": "unauthorized" }`. Routes marked **Bearer** require `Authorization: Bearer <token>`; missing/unknown token → 401 `{ "error": "invalid_token" }`. JSON in and out. Timestamps are ISO-8601 UTC strings.

```ts
type FeedbackKind = 'suggestion' | 'bug' | 'question';
type ThreadStatus = 'open' | 'answered' | 'archived';

interface FeedbackMessage { id: string; author: 'device' | 'admin'; body: string; createdAt: string }
interface ThreadSummary {
  id: string; kind: FeedbackKind; stationId: string | null; status: ThreadStatus;
  unread: boolean;            // an admin reply this device has not opened yet
  preview: string;            // first device message, max 140 code points + '…'
  createdAt: string; updatedAt: string;
}
interface ThreadDetail extends ThreadSummary { messages: FeedbackMessage[] } // oldest first
```

| Method & path | Auth | Request body | Success | Errors |
|---|---|---|---|---|
| `POST /devices/register` | key | `{ deviceId: uuid }` | 201 `{ token: string }` (43 chars, base64url) | 400 `{error:'invalid',field:'deviceId'}`, 409 `{error:'already_registered'}`, 429 (10/h/IP) |
| `GET /me/notifications` | Bearer | — | 200 `StoredNotification[]` (same shape as `GET /notifications`) | 401 |
| `PUT /me/push-token` | Bearer | `{ pushToken: 'ExponentPushToken[...]' \| null }` | 204 | 400 `{field:'pushToken'}`, 401 |
| `POST /me/ping` | Bearer | `{ stationId?: string }` | 204 | 400 `{field:'stationId'}`, 401 |
| `POST /feedback` | Bearer | `{ kind, body, stationId?, appVersion, osVersion }` | 201 `ThreadDetail` (200 with the existing thread on a retry within 60 s) | 400 `{field}`, 401, 429 `{error:'limit',limit:'threads'\|'messages'}` |
| `GET /feedback` | Bearer | — | 200 `ThreadSummary[]`, newest `updatedAt` first | 401 |
| `GET /feedback/:id` | Bearer | — | 200 `ThreadDetail` (clears `unread`; response has `unread: false`) | 401, 404 `{error:'not_found'}` |
| `POST /feedback/:id/messages` | Bearer | `{ body }` | 201 `FeedbackMessage` (200 with the existing one on a retry within 60 s); reopens the thread as `open` | 400 `{field:'body'}`, 401, 404, 429 `{limit:'messages'}` |

Push sent on an admin reply (Expo): `{ title: 'Paraná Info', body: 'Tenés una respuesta a tu mensaje', data: { type: 'feedback_reply', threadId: '<uuid>' } }`.

Legacy (until `LEGACY_DEVICE_ROUTES=off`, then 410 `{ error: 'gone' }`): `POST /devices/ping`, `POST /devices/push-token`, `GET /notifications`.

## Spec Deviations (decided here, with reasons)

- `devices.token_hash` is `text` (lower-case hex SHA-256) with a unique index, not `bytea`: pg-mem corrupts `Buffer` parameters (verified), and a store without tests is worse than 32 extra bytes per row.
- Registration is `INSERT … ON CONFLICT DO NOTHING` + `UPDATE … WHERE token_hash IS NULL RETURNING`: pg-mem ignores the `WHERE` of `ON CONFLICT DO UPDATE` (verified), which would silently re-issue tokens in tests.
- No multi-statement transactions: pg-mem does not roll back (verified). The rolling limits therefore have a tiny check-then-insert race under truly concurrent requests from one device; accepted as soft limits (the per-device request-rate limit bounds it).
- "The app role has INSERT and SELECT only" on `admin_audit` is an operations step (Task 19), not schema: pg-mem has no `GRANT/REVOKE`, and if the Coolify `DATABASE_URL` user is a superuser, no grant restricts it anyway.
- 401 for an unknown device token uses `{ error: 'invalid_token' }` so the app can tell "re-register" apart from "the API key is wrong" (which must not wipe its token).
- Admin CSRF failure returns the same 404 as an unknown path (spec: "Unknown and unauthorised admin paths return the same 404").
- Sessions and the lockout counter live in process memory (single process). A restart logs the owner out and resets the counter; acceptable for one owner.
- `/stats` gains `auth.activeWithToken` / `auth.shareOfActive` — the spec's sunset rule ("2.2.0+ share of active devices from /stats") needs a number that does not exist today. A device with a token is by definition 2.2.0+.

---

## File Structure

| File | Responsibility |
|---|---|
| `server/package.json` (modify) | Fastify 5, rate-limit 10, cookie, formbody, @node-rs/argon2 |
| `server/src/server.ts` (modify) | Public instance: logger, bodyLimit, error handler, `deviceId` request decoration, `now`/legacy options |
| `server/src/logging.ts` (create) | Pino options + redact paths shared by both instances |
| `server/src/config/env.ts` (modify) | All new env vars with lenient defaults (bad admin/email config disables a feature, never crashes the API) |
| `server/src/index.ts` (modify) | Wires logger, feedback jobs, admin listener |
| `server/src/middleware/apiKey.ts` (modify) | `return reply…send()` for Fastify 5 async hooks |
| `server/src/auth/deviceToken.ts` (create) | Issue, hash, parse bearer tokens (pure) |
| `server/src/auth/requireDevice.ts` (create) | preHandler resolving `req.deviceId` from the bearer token |
| `server/src/stores/deviceTokenStore.ts` (create) | TOFU registration + token→device lookup |
| `server/src/routes/devices.ts` (create) | `/devices/register`, `/me/*`, per-device rate-limit config |
| `server/src/routes/index.ts` (modify) | Legacy 410 switch; mounts device + feedback routes; `/river` bodyLimit |
| `server/src/stores/deviceStats.ts` (modify) | `auth` share for the legacy sunset |
| `server/src/db/schema.sql` (modify) | token columns, feedback tables, `admin_audit`, `job_state` |
| `server/src/feedback/validation.ts` (create) | zod schemas, code-point length, field-name errors |
| `server/src/stores/feedbackStore.ts` (create) | Device-side thread/message persistence, ownership, limits, dedupe |
| `server/src/routes/feedback.ts` (create) | `/feedback*` device routes |
| `server/src/services/expoPush.ts` (create) | Single Expo push send → outcome |
| `server/src/services/replyPush.ts` (create) | Reply notification to the thread's device |
| `server/src/stores/jobState.ts` (create) | Persistent marks for periodic jobs |
| `server/src/services/ownerEmail.ts` (create) | Pending-message query, email composition, Resend send, tick |
| `server/src/services/feedbackRetention.ts` (create) | 12-month purge |
| `server/src/feedbackScheduler.ts` (create) | 5-minute tick running email + daily purge |
| `server/src/admin/html.ts` (create) | Escape-by-default tagged template |
| `server/src/admin/sessions.ts` (create) | In-memory session store (12 h) |
| `server/src/admin/lockout.ts` (create) | 5 failures → 15 min lock |
| `server/src/admin/password.ts` (create) | argon2id hash/verify |
| `server/src/admin/hashPassword.ts` (create) | CLI: stdin password → hash |
| `server/src/stores/adminAudit.ts` (create) | Append-only audit insert/list |
| `server/src/stores/feedbackAdminStore.ts` (create) | Inbox filters, admin detail, reply, archive |
| `server/src/admin/views.ts` (create) | Login, inbox, thread, 404 pages + CSS |
| `server/src/admin/server.ts` (create) | Second Fastify instance: auth, CSRF, headers, actions |
| `server/Dockerfile` (modify) | `EXPOSE 3000 3100` |
| `server/DEPLOY-COOLIFY.md` (modify) | Env vars, tailnet port mapping, Traefik fallback, Resend DNS, DB role, verification |
| `server/test/helpers/memPool.ts` (create) | pg-mem pool with `char_length` registered + migrations |
| `server/test/helpers/devices.ts` (create) | `KEY`, `H`, `registerToken`, `bearer` |
| `server/test/helpers/admin.ts` (create) | Admin login/CSRF helpers for inject tests |
| `server/test/**` (create/modify) | One test file per module above |

---

# Phase 0 — Security groundwork (deployable alone; old app versions unaffected)

### Task 1: Upgrade to Fastify 5 and @fastify/rate-limit 10 behind an audit gate

**Files:**
- Modify: `server/package.json`, `server/package-lock.json`
- Modify: `server/src/middleware/apiKey.ts:18-22`
- Test: `server/test/framework.test.ts` (create)

**Interfaces:** Consumes: nothing. Produces: Fastify ≥ 5 for every later task (`reply.redirect(url, code)` argument order, async hooks must `return reply`).

- [ ] **Step 1: Write the failing test**

```ts
// server/test/framework.test.ts
import { describe, it, expect } from 'vitest';
import { buildServer } from '../src/server.js';

// The security review found client-IP spoofing (proxy-addr) and three high
// advisories in the Fastify 4 tree. This pins the major so a lockfile revert
// cannot silently bring them back.
describe('framework', () => {
  it('runs on Fastify 5 or later', async () => {
    const app = await buildServer();
    expect(Number(app.version.split('.')[0])).toBeGreaterThanOrEqual(5);
    await app.close();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/framework.test.ts`
Expected: FAIL — `expected 4 to be greater than or equal to 5`.

- [ ] **Step 3: Minimal implementation**

```bash
npm install fastify@^5.12.7 @fastify/rate-limit@^10.3.0
```

In `server/src/middleware/apiKey.ts`, Fastify 5 requires an async hook that sends to return the reply:

```ts
    if (!key || !safeEqual(key, expectedKey)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run && npm run build && npm audit --omit=dev --audit-level=high`
Expected: all test files pass; `tsc` exits 0; audit exits 0 (`found 0 vulnerabilities` or only low/moderate). If audit still reports high/critical, run `npm audit --omit=dev` and bump the named package (`npm install <pkg>@latest`) until it is clean — do not commit with high/critical.

- [ ] **Step 5: Commit**

```bash
git add server/package.json server/package-lock.json server/src/middleware/apiKey.ts server/test/framework.test.ts
git commit -m "build(server): upgrade to fastify 5 and rate-limit 10 to clear audit advisories"
```

---

### Task 2: Logger with redaction, generic 5xx, explicit body limit

**Files:**
- Create: `server/src/logging.ts`
- Modify: `server/src/server.ts` (whole file), `server/src/routes/index.ts:77` (`app.post('/river', …)` signature), `server/src/config/env.ts` (whole file), `server/src/index.ts:10-15`
- Test: `server/test/serverHardening.test.ts` (create), `server/test/env.test.ts` (modify)

**Interfaces:** Consumes: Fastify 5. Produces: `loggerOptions(cfg: LoggerConfig)`, `type LoggerConfig = { level?: string; stream?: { write(msg: string): void } }`, `REDACT_PATHS: string[]`; `BuildServerOptions.logger?: LoggerConfig`; `Env.logLevel: string`; error bodies `{ error: 'internal' | 'invalid' | 'too_large' | 'rate_limited' }`.

- [ ] **Step 1: Write the failing test**

```ts
// server/test/serverHardening.test.ts
import { describe, it, expect } from 'vitest';
import type { Pool } from 'pg';
import { buildServer } from '../src/server.js';
import { memPool } from './helpers/memPool.js';

const KEY = 'secret';
const H = { 'x-api-key': KEY };

function capture() {
  const lines: string[] = [];
  return { lines, stream: { write: (m: string) => { lines.push(m); } } };
}

describe('logging', () => {
  it('redacts credentials wherever they appear in a log line', async () => {
    const { lines, stream } = capture();
    const app = await buildServer({ logger: { level: 'info', stream } });

    app.log.info(
      {
        req: { headers: { authorization: 'Bearer SECRET_BEARER', 'x-api-key': 'SECRET_KEY', 'x-refresh-token': 'SECRET_REFRESH', cookie: 'admin_session=SECRET_COOKIE' } },
        body: { token: 'SECRET_TOKEN', password: 'SECRET_PW', pushToken: 'SECRET_PUSH' },
        token: 'SECRET_TOKEN2',
      },
      'probe',
    );

    const out = lines.join('');
    expect(out).toContain('probe');
    expect(out).toContain('[redacted]');
    expect(out).not.toMatch(/SECRET_/);
    await app.close();
  });
});

describe('errors', () => {
  it('logs a 5xx and answers with a generic body', async () => {
    const { lines, stream } = capture();
    const failing = { query: async () => { throw new Error('connect db-internal-host:5432 refused'); } } as unknown as Pool;
    const app = await buildServer({ pool: failing, apiKey: KEY, logger: { level: 'info', stream } });

    const res = await app.inject({ method: 'GET', url: '/news', headers: H });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'internal' });
    expect(lines.join('')).toContain('db-internal-host');
    await app.close();
  });

  it('does not echo a malformed JSON body back', async () => {
    const app = await buildServer({ pool: await memPool(), apiKey: KEY });

    const res = await app.inject({
      method: 'POST', url: '/devices/ping',
      headers: { ...H, 'content-type': 'application/json' },
      payload: '{"deviceId": <script>',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'invalid' });
    expect(res.body).not.toContain('script');
    await app.close();
  });
});

describe('body limit', () => {
  it('refuses bodies over 16 KB', async () => {
    const app = await buildServer({ pool: await memPool(), apiKey: KEY });

    const res = await app.inject({
      method: 'POST', url: '/devices/ping', headers: H,
      payload: { deviceId: '11111111-1111-4111-8111-111111111111', stationId: 'x'.repeat(17 * 1024) },
    });

    expect(res.statusCode).toBe(413);
    expect(res.json()).toEqual({ error: 'too_large' });
    await app.close();
  });

  it('still accepts a full 200-reading crowd batch on POST /river', async () => {
    const app = await buildServer({ pool: await memPool(), apiKey: KEY });
    const reading = {
      stationId: 'rosario', level: 3.14, trend: 'stable', changeRate: 0,
      timestamp: new Date().toISOString(), alertLevel: 5.3, evacuationLevel: 5.8,
    };

    const res = await app.inject({
      method: 'POST', url: '/river', headers: H,
      payload: { readings: Array.from({ length: 200 }, () => reading) },
    });

    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
```

Also create the pg-mem helper this test (and every later DB test) uses:

```ts
// server/test/helpers/memPool.ts
import { newDb, DataType } from 'pg-mem';
import type { Pool } from 'pg';
import { runMigrations } from '../../src/db/index.js';

// pg-mem ships without char_length, which the feedback_messages CHECK needs.
// Postgres counts code points, not UTF-16 units, and so does this.
export async function memPool(): Promise<Pool> {
  const mem = newDb();
  mem.public.registerFunction({
    name: 'char_length',
    args: [DataType.text],
    returns: DataType.integer,
    implementation: (s: string) => [...s].length,
  });
  const { Pool: MemPool } = mem.adapters.createPg();
  const pool = new MemPool() as Pool;
  await runMigrations(pool);
  return pool;
}
```

Replace the first test in `server/test/env.test.ts` and add one:

```ts
  it('parses valid env', () => {
    const env = loadEnv({ PORT: '4000', DATABASE_URL: 'postgres://x', APP_API_KEY: 'secret' });
    expect(env).toMatchObject({ port: 4000, databaseUrl: 'postgres://x', apiKey: 'secret' });
  });

  it('defaults the log level to info and treats empty strings as unset', () => {
    const env = loadEnv({ DATABASE_URL: 'postgres://x', APP_API_KEY: 'secret', LOG_LEVEL: '' });
    expect(env.logLevel).toBe('info');
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/serverHardening.test.ts test/env.test.ts`
Expected: FAIL — redaction test finds `SECRET_` (logger is `false`, so actually no output: `expected '' to contain 'probe'`); the 5xx test gets a body with the raw error message; 413 body is Fastify's default; `env.logLevel` is `undefined`.

- [ ] **Step 3: Minimal implementation**

```ts
// server/src/logging.ts
// One logger configuration for both Fastify instances. Credentials are
// redacted by path so a future `req.log.info({ req })` cannot leak them.
export interface LoggerConfig {
  level?: string;
  stream?: { write(msg: string): void };
}

export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers["x-api-key"]',
  'req.headers["x-refresh-token"]',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'token',
  'password',
  'pushToken',
  '*.token',
  '*.password',
  '*.pushToken',
];

export function loggerOptions(cfg: LoggerConfig) {
  return {
    level: cfg.level ?? 'info',
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    ...(cfg.stream ? { stream: cfg.stream } : {}),
  };
}
```

```ts
// server/src/server.ts
import Fastify, { FastifyError, FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import type { Pool } from 'pg';
import { registerRoutes } from './routes/index.js';
import { apiKeyGuard } from './middleware/apiKey.js';
import { loggerOptions, type LoggerConfig } from './logging.js';

export const BODY_LIMIT = 16 * 1024;

export interface BuildServerOptions {
  pool?: Pool;
  apiKey?: string;
  weatherDeps?: { fetchFn?: typeof fetch };
  refreshFetch?: typeof fetch;
  refreshToken?: string;
  rateLimit?: boolean;
  /** Omitted in tests: the suite stays quiet unless a test captures logs. */
  logger?: LoggerConfig;
}

export async function buildServer(opts: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ? loggerOptions(opts.logger) : false,
    trustProxy: 1,
    bodyLimit: BODY_LIMIT,
  });

  // Nothing generated by a client is echoed back: parser messages quote the
  // input, and a 5xx message can carry hostnames or SQL.
  app.setErrorHandler((err: FastifyError, req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
    if (status >= 500) {
      req.log.error({ err }, 'request failed');
      return reply.code(500).send({ error: 'internal' });
    }
    if (status === 413) return reply.code(413).send({ error: 'too_large' });
    if (status === 429) return reply.code(429).send({ error: 'rate_limited' });
    return reply.code(status).send({ error: 'invalid' });
  });

  if (opts.rateLimit) {
    await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  }

  app.get('/health', async () => ({ status: 'ok' }));

  // The public read is meant to be consumed from a browser on another origin,
  // such as the landing page. Only that prefix is opened; everything else
  // stays same-origin and behind the key.
  app.addHook('onSend', async (req, reply, payload) => {
    if (req.url.split('?')[0].startsWith('/public/')) {
      reply.header('Access-Control-Allow-Origin', '*');
    }
    return payload;
  });

  if (opts.apiKey) app.addHook('preHandler', apiKeyGuard(opts.apiKey));
  if (opts.pool)
    registerRoutes(app, {
      pool: opts.pool,
      weatherDeps: opts.weatherDeps,
      refreshFetch: opts.refreshFetch,
      refreshToken: opts.refreshToken,
    });

  return app;
}
```

In `server/src/routes/index.ts`, give the crowd batch its own limit:

```ts
  // The one legitimately large body: a phone pushing every station at once.
  app.post('/river', { bodyLimit: 64 * 1024 }, async (req, reply) => {
```

```ts
// server/src/config/env.ts
import { z } from 'zod';

const schema = z.object({
  PORT: z.string().regex(/^\d+$/).optional(),
  DATABASE_URL: z.string().min(1),
  APP_API_KEY: z.string().min(1),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
});

export interface Env {
  port: number;
  databaseUrl: string;
  apiKey: string;
  logLevel: string;
}

// Coolify can leave a variable defined but empty; that means "unset".
function present(source: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1] !== ''),
  );
}

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.parse(present(source));
  return {
    port: parsed.PORT ? Number(parsed.PORT) : 3000,
    databaseUrl: parsed.DATABASE_URL,
    apiKey: parsed.APP_API_KEY,
    logLevel: parsed.LOG_LEVEL ?? 'info',
  };
}
```

In `server/src/index.ts`, pass the logger:

```ts
  const app = await buildServer({
    pool,
    apiKey: env.apiKey,
    rateLimit: true,
    refreshToken: process.env.REFRESH_TOKEN,
    logger: { level: env.logLevel },
  });
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run && npm run build`
Expected: all pass, `tsc` exits 0.

- [ ] **Step 5: Commit**

```bash
git add server/src/logging.ts server/src/server.ts server/src/routes/index.ts server/src/config/env.ts server/src/index.ts server/test/serverHardening.test.ts server/test/env.test.ts server/test/helpers/memPool.ts
git commit -m "feat(server): enable redacted logging, generic 5xx bodies and a 16 KB body limit"
```

---

### Task 3: Device token primitives and storage

**Files:**
- Modify: `server/src/db/schema.sql` (append)
- Create: `server/src/auth/deviceToken.ts`, `server/src/stores/deviceTokenStore.ts`
- Test: `server/test/auth/deviceToken.test.ts`, `server/test/stores/deviceTokenStore.test.ts`

**Interfaces:** Consumes: `memPool()` (Task 2). Produces: `issueToken(): { token: string; hash: string }`, `hashToken(token: string): string`, `parseBearer(header: string | string[] | undefined): string | null`, `registerDevice(pool: Pool, deviceId: string, tokenHash: string, now?: Date): Promise<'issued' | 'already_registered'>`, `deviceForTokenHash(pool: Pool, tokenHash: string): Promise<string | null>`.

- [ ] **Step 1: Write the failing test**

```ts
// server/test/auth/deviceToken.test.ts
import { describe, it, expect } from 'vitest';
import { hashToken, issueToken, parseBearer } from '../../src/auth/deviceToken.js';

describe('issueToken', () => {
  it('issues 256 random bits as 43 base64url characters', () => {
    const { token } = issueToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('never issues the same token twice', () => {
    const seen = new Set(Array.from({ length: 200 }, () => issueToken().token));
    expect(seen.size).toBe(200);
  });

  it('returns the hash of the token it returns, never the token itself', () => {
    const { token, hash } = issueToken();
    expect(hash).toBe(hashToken(token));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
  });
});

describe('parseBearer', () => {
  const token = 'a'.repeat(43);

  it('reads a well-formed header', () => {
    expect(parseBearer(`Bearer ${token}`)).toBe(token);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['lower-case scheme', `bearer ${token}`],
    ['two spaces', `Bearer  ${token}`],
    ['trailing space', `Bearer ${token} `],
    ['too short', 'Bearer abc'],
    ['too long', `Bearer ${token}a`],
    ['not base64url', `Bearer ${'+'.repeat(43)}`],
  ])('rejects %s', (_label, header) => {
    expect(parseBearer(header)).toBeNull();
  });

  it('uses the first value when the header is repeated', () => {
    expect(parseBearer([`Bearer ${token}`, 'Bearer other'])).toBe(token);
  });
});
```

```ts
// server/test/stores/deviceTokenStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { memPool } from '../helpers/memPool.js';
import { pingDevice } from '../../src/stores/deviceStore.js';
import { deviceForTokenHash, registerDevice } from '../../src/stores/deviceTokenStore.js';

const A = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-10-13T12:00:00.000Z');
let pool: Pool;

beforeEach(async () => {
  pool = await memPool();
});

describe('registerDevice', () => {
  it('issues a token for a device it has never seen', async () => {
    expect(await registerDevice(pool, A, 'h1', NOW)).toBe('issued');
    expect(await deviceForTokenHash(pool, 'h1')).toBe(A);
  });

  it('issues a token for a device that pinged before it had one', async () => {
    // Every install upgrading from 2.1.x already has a row with no token.
    await pingDevice(pool, A, 'rosario', NOW);
    expect(await registerDevice(pool, A, 'h1', NOW)).toBe('issued');
  });

  it('refuses to re-register a device that already holds a token', async () => {
    await registerDevice(pool, A, 'h1', NOW);

    expect(await registerDevice(pool, A, 'h2', NOW)).toBe('already_registered');
    expect(await deviceForTokenHash(pool, 'h1')).toBe(A);
    expect(await deviceForTokenHash(pool, 'h2')).toBeNull();
  });
});

describe('deviceForTokenHash', () => {
  it('returns null for an unknown hash', async () => {
    expect(await deviceForTokenHash(pool, 'nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/auth test/stores/deviceTokenStore.test.ts`
Expected: FAIL — `Cannot find module '../../src/auth/deviceToken.js'` / `deviceTokenStore.js`.

- [ ] **Step 3: Minimal implementation**

Append to `server/src/db/schema.sql`:

```sql
-- Per-device credential (2.2.0+). Only the SHA-256 of the token is kept, as
-- lower-case hex: the token is 256 random bits, so a slow hash adds nothing,
-- and pg-mem cannot round-trip bytea. NULLs do not collide in the index.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS token_hash text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS token_issued_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS devices_token_hash ON devices (token_hash);
```

```ts
// server/src/auth/deviceToken.ts
import { createHash, randomBytes } from 'node:crypto';

// The device credential. It is returned once and only its hash is stored, so
// a database leak does not hand out working tokens.

const BEARER = /^Bearer ([A-Za-z0-9_-]{43})$/;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function issueToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

/** The token in an `Authorization: Bearer …` header, or null for anything else. */
export function parseBearer(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return null;
  const match = BEARER.exec(value);
  return match ? match[1] : null;
}
```

```ts
// server/src/stores/deviceTokenStore.ts
import type { Pool } from 'pg';

export type RegisterResult = 'issued' | 'already_registered';

/**
 * Trust on first use: the first caller to present a deviceId gets its token,
 * and nobody gets another one for that id afterwards. Two statements rather
 * than ON CONFLICT DO UPDATE … WHERE, because pg-mem ignores that WHERE and
 * would re-issue tokens in tests without anyone noticing.
 */
export async function registerDevice(
  pool: Pool,
  deviceId: string,
  tokenHash: string,
  now: Date = new Date(),
): Promise<RegisterResult> {
  const ts = now.toISOString();
  await pool.query(
    `INSERT INTO devices (device_id, first_seen, last_seen)
     VALUES ($1, $2, $2)
     ON CONFLICT (device_id) DO NOTHING`,
    [deviceId, ts],
  );
  const res = await pool.query(
    `UPDATE devices SET token_hash = $2, token_issued_at = $3, last_seen = $3
      WHERE device_id = $1 AND token_hash IS NULL
      RETURNING device_id`,
    [deviceId, tokenHash, ts],
  );
  return res.rows.length === 1 ? 'issued' : 'already_registered';
}

export async function deviceForTokenHash(pool: Pool, tokenHash: string): Promise<string | null> {
  const res = await pool.query(`SELECT device_id FROM devices WHERE token_hash = $1`, [tokenHash]);
  return res.rows[0] ? String(res.rows[0].device_id) : null;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run`
Expected: all pass (existing tests are unaffected: the new columns are nullable).

- [ ] **Step 5: Commit**

```bash
git add server/src/db/schema.sql server/src/auth/deviceToken.ts server/src/stores/deviceTokenStore.ts server/test/auth/deviceToken.test.ts server/test/stores/deviceTokenStore.test.ts
git commit -m "feat(server): issue and store per-device tokens (hash only, trust on first use)"
```

---

### Task 4: `requireDevice` guard and `POST /devices/register`

**Files:**
- Create: `server/src/auth/requireDevice.ts`, `server/src/routes/devices.ts`, `server/test/helpers/devices.ts`
- Modify: `server/src/server.ts` (decorate request), `server/src/routes/index.ts` (mount device routes at the end of `registerRoutes`)
- Test: `server/test/auth/requireDevice.test.ts`, `server/test/routes/devices.test.ts`

**Interfaces:** Consumes: `parseBearer`, `hashToken`, `issueToken`, `registerDevice`, `deviceForTokenHash` (Task 3). Produces: `requireDevice(pool: Pool): (req: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined>` setting `req.deviceId: string`; `registerDeviceRoutes(app: FastifyInstance, deps: { pool: Pool }): void`; `deviceRateKey(req: FastifyRequest): string`; `DEVICE_WRITE_LIMIT`; test helpers `KEY`, `H`, `registerToken(app, deviceId): Promise<string>`, `bearer(token): Record<string, string>`.

- [ ] **Step 1: Write the failing test**

```ts
// server/test/helpers/devices.ts
import type { FastifyInstance } from 'fastify';

export const KEY = 'secret';
export const H = { 'x-api-key': KEY };
export const A = '11111111-1111-4111-8111-111111111111';
export const B = '22222222-2222-4222-8222-222222222222';

export async function registerToken(app: FastifyInstance, deviceId: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/devices/register', headers: H, payload: { deviceId } });
  if (res.statusCode !== 201) throw new Error(`register failed: ${res.statusCode}`);
  return res.json().token as string;
}

export const bearer = (token: string) => ({ ...H, authorization: `Bearer ${token}` });
```

```ts
// server/test/auth/requireDevice.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { Pool } from 'pg';
import { memPool } from '../helpers/memPool.js';
import { A } from '../helpers/devices.js';
import { requireDevice } from '../../src/auth/requireDevice.js';
import { issueToken } from '../../src/auth/deviceToken.js';
import { registerDevice } from '../../src/stores/deviceTokenStore.js';

let pool: Pool;
beforeEach(async () => {
  pool = await memPool();
});

function guarded() {
  const app = Fastify();
  app.decorateRequest('deviceId', null);
  app.get('/who', { preHandler: requireDevice(pool) }, async (req) => ({ deviceId: req.deviceId }));
  return app;
}

describe('requireDevice', () => {
  it('resolves the device from its token', async () => {
    const { token, hash } = issueToken();
    await registerDevice(pool, A, hash);
    const app = guarded();

    const res = await app.inject({ method: 'GET', url: '/who', headers: { authorization: `Bearer ${token}` } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ deviceId: A });
    await app.close();
  });

  it.each([
    ['no header', {}],
    ['malformed header', { authorization: 'Bearer nope' }],
    ['unknown token', { authorization: `Bearer ${'a'.repeat(43)}` }],
  ])('answers 401 invalid_token for %s', async (_label, headers) => {
    const app = guarded();
    const res = await app.inject({ method: 'GET', url: '/who', headers });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'invalid_token' });
    await app.close();
  });

  it('answers 401, not 500, when the token is valid but its device row is gone', async () => {
    const { token, hash } = issueToken();
    await registerDevice(pool, A, hash);
    await pool.query('DELETE FROM devices WHERE device_id = $1', [A]);
    const app = guarded();

    const res = await app.inject({ method: 'GET', url: '/who', headers: { authorization: `Bearer ${token}` } });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'invalid_token' });
    await app.close();
  });
});
```

```ts
// server/test/routes/devices.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { buildServer } from '../../src/server.js';
import { memPool } from '../helpers/memPool.js';
import { A, H, KEY } from '../helpers/devices.js';
import { pingDevice } from '../../src/stores/deviceStore.js';

let pool: Pool;
beforeEach(async () => {
  pool = await memPool();
});

const app = (rateLimit = false) => buildServer({ pool, apiKey: KEY, rateLimit });
const register = (a: Awaited<ReturnType<typeof app>>, deviceId: unknown) =>
  a.inject({ method: 'POST', url: '/devices/register', headers: H, payload: { deviceId } as never });

describe('POST /devices/register', () => {
  it('returns a token once and stores only its hash', async () => {
    const a = await app();
    const res = await register(a, A);

    expect(res.statusCode).toBe(201);
    const { token } = res.json();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const row = await pool.query('SELECT token_hash FROM devices WHERE device_id = $1', [A]);
    expect(row.rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.rows[0].token_hash).not.toBe(token);
    await a.close();
  });

  it('upgrades a device that pinged on an older version', async () => {
    await pingDevice(pool, A, 'rosario');
    const a = await app();
    expect((await register(a, A)).statusCode).toBe(201);
    await a.close();
  });

  it('refuses to hand out a second token for the same device', async () => {
    const a = await app();
    await register(a, A);

    const res = await register(a, A);

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'already_registered' });
    await a.close();
  });

  it('rejects a deviceId that is not a uuid, naming the field', async () => {
    const a = await app();
    const res = await register(a, '<script>');
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'invalid', field: 'deviceId' });
    await a.close();
  });

  it('stays behind the api key', async () => {
    const a = await app();
    const res = await a.inject({ method: 'POST', url: '/devices/register', payload: { deviceId: A } });
    expect(res.statusCode).toBe(401);
    await a.close();
  });

  it('limits registrations to 10 an hour per IP', async () => {
    const a = await app(true);
    for (let i = 0; i < 10; i++) expect((await register(a, randomUUID())).statusCode).toBe(201);

    expect((await register(a, randomUUID())).statusCode).toBe(429);
    await a.close();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/auth/requireDevice.test.ts test/routes/devices.test.ts`
Expected: FAIL — `Cannot find module '../../src/auth/requireDevice.js'`; register route returns 404.

- [ ] **Step 3: Minimal implementation**

```ts
// server/src/auth/requireDevice.ts
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { hashToken, parseBearer } from './deviceToken.js';
import { deviceForTokenHash } from '../stores/deviceTokenStore.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by requireDevice from the bearer token; never from the body or query. */
    deviceId: string | null;
  }
}

// 'invalid_token' rather than the api key's 'unauthorized': the app drops and
// re-registers its token on this answer, and must not do that when the
// problem is the key baked into its bundle.
export function requireDevice(pool: Pool) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const token = parseBearer(req.headers.authorization);
    const deviceId = token ? await deviceForTokenHash(pool, hashToken(token)) : null;
    if (!deviceId) return reply.code(401).send({ error: 'invalid_token' });
    req.deviceId = deviceId;
  };
}
```

```ts
// server/src/routes/devices.ts
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { hashToken, issueToken, parseBearer } from '../auth/deviceToken.js';
import { registerDevice } from '../stores/deviceTokenStore.js';

export interface DeviceRouteDeps {
  pool: Pool;
}

/** Writes are limited per device, keyed on the token so one phone cannot spend everyone's budget. */
export function deviceRateKey(req: FastifyRequest): string {
  const token = parseBearer(req.headers.authorization);
  return token ? `device:${hashToken(token)}` : `ip:${req.ip}`;
}

export const DEVICE_WRITE_LIMIT = { max: 60, timeWindow: '1 minute', keyGenerator: deviceRateKey };

const registerBody = z.object({ deviceId: z.string().uuid() });

export function registerDeviceRoutes(app: FastifyInstance, deps: DeviceRouteDeps): void {
  const { pool } = deps;

  app.post(
    '/devices/register',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const parsed = registerBody.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid', field: 'deviceId' });

      const { token, hash } = issueToken();
      const result = await registerDevice(pool, parsed.data.deviceId, hash);
      if (result === 'already_registered') return reply.code(409).send({ error: 'already_registered' });
      return reply.code(201).send({ token });
    },
  );
}
```

In `server/src/server.ts`, right after the `Fastify({...})` call:

```ts
  app.decorateRequest('deviceId', null);
```

In `server/src/routes/index.ts`, add the import and, as the last line of `registerRoutes`:

```ts
import { registerDeviceRoutes } from './devices.js';
// …
  registerDeviceRoutes(app, { pool });
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run && npm run build`
Expected: all pass.

- [ ] **Step 5: MUTATION-CHECK the token resolution**

```bash
cp src/auth/requireDevice.ts /tmp/requireDevice.ts.bak
sd -F "if (!deviceId) return reply.code(401).send({ error: 'invalid_token' });" "" src/auth/requireDevice.ts
npx vitest run test/auth/requireDevice.test.ts
```
Expected: FAIL — the four 401 cases now get 200 with `{"deviceId":null}`. Then restore and re-run:

```bash
cp /tmp/requireDevice.ts.bak src/auth/requireDevice.ts
npx vitest run test/auth/requireDevice.test.ts
```
Expected: PASS. `git diff --stat src/auth/requireDevice.ts` shows no change against the version you wrote.

- [ ] **Step 6: Commit**

```bash
git add server/src/auth/requireDevice.ts server/src/routes/devices.ts server/src/server.ts server/src/routes/index.ts server/test/helpers/devices.ts server/test/auth/requireDevice.test.ts server/test/routes/devices.test.ts
git commit -m "feat(server): register devices and resolve them from bearer tokens"
```

---

### Task 5: Authenticated `/me/*` routes

**Files:**
- Modify: `server/src/routes/devices.ts` (add three routes)
- Test: `server/test/routes/me.test.ts`

**Interfaces:** Consumes: `requireDevice`, `DEVICE_WRITE_LIMIT`, `registerToken`, `bearer`, `getNotifications`, `recordNotification`, `savePushToken`, `subscribers`, `pingDevice`. Produces: `GET /me/notifications`, `PUT /me/push-token`, `POST /me/ping` per the API contract.

- [ ] **Step 1: Write the failing test**

```ts
// server/test/routes/me.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { buildServer } from '../../src/server.js';
import { memPool } from '../helpers/memPool.js';
import { A, B, H, KEY, bearer, registerToken } from '../helpers/devices.js';
import { recordNotification, savePushToken, subscribers } from '../../src/stores/pushStore.js';

const PUSH_A = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const PUSH_B = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';
let pool: Pool;
beforeEach(async () => {
  pool = await memPool();
});
const app = () => buildServer({ pool, apiKey: KEY });

describe('GET /me/notifications', () => {
  it("returns only the token's own history", async () => {
    const a = await app();
    const token = await registerToken(a, A);
    await recordNotification(pool, A, 'rosario', 'Mine', 'b');
    await recordNotification(pool, B, 'goya', 'Theirs', 'b');

    const res = await a.inject({ method: 'GET', url: `/me/notifications?deviceId=${B}`, headers: bearer(token) });

    expect(res.statusCode).toBe(200);
    expect(res.json().map((n: { title: string }) => n.title)).toEqual(['Mine']);
    await a.close();
  });

  it('needs a token, not just the api key', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: '/me/notifications', headers: H });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'invalid_token' });
    await a.close();
  });
});

describe('PUT /me/push-token', () => {
  it('writes to the token device and ignores a deviceId in the body', async () => {
    const a = await app();
    const token = await registerToken(a, A);
    await savePushToken(pool, B, PUSH_B);

    const res = await a.inject({
      method: 'PUT', url: '/me/push-token', headers: bearer(token),
      payload: { deviceId: B, pushToken: PUSH_A },
    });

    expect(res.statusCode).toBe(204);
    const subs = await subscribers(pool);
    expect(subs.find((s) => s.deviceId === A)?.pushToken).toBe(PUSH_A);
    expect(subs.find((s) => s.deviceId === B)?.pushToken).toBe(PUSH_B);
    await a.close();
  });

  it('accepts null to turn notifications off', async () => {
    const a = await app();
    const token = await registerToken(a, A);
    const res = await a.inject({ method: 'PUT', url: '/me/push-token', headers: bearer(token), payload: { pushToken: null } });
    expect(res.statusCode).toBe(204);
    await a.close();
  });

  it('rejects a token that is not an Expo one', async () => {
    const a = await app();
    const token = await registerToken(a, A);
    const res = await a.inject({ method: 'PUT', url: '/me/push-token', headers: bearer(token), payload: { pushToken: 'hello' } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'invalid', field: 'pushToken' });
    await a.close();
  });
});

describe('POST /me/ping', () => {
  it('records the station view against the token device', async () => {
    const a = await app();
    const token = await registerToken(a, A);

    const res = await a.inject({ method: 'POST', url: '/me/ping', headers: bearer(token), payload: { deviceId: B, stationId: 'rosario' } });

    expect(res.statusCode).toBe(204);
    const views = await pool.query('SELECT device_id FROM device_station_views');
    expect(views.rows.map((r) => String(r.device_id))).toEqual([A]);
    await a.close();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/routes/me.test.ts`
Expected: FAIL — 404 for `/me/*`.

- [ ] **Step 3: Minimal implementation**

Add to `server/src/routes/devices.ts` (imports at the top, routes at the end of `registerDeviceRoutes`):

```ts
import { requireDevice } from '../auth/requireDevice.js';
import { getNotifications, savePushToken } from '../stores/pushStore.js';
import { pingDevice } from '../stores/deviceStore.js';

const mePushTokenBody = z.object({
  pushToken: z.string().regex(/^ExponentPushToken\[[^\]]+\]$/).nullable(),
});
const mePingBody = z.object({ stationId: z.string().min(1).max(64).optional() });
```

```ts
  // The device comes from the token. A deviceId in the body or query is
  // ignored on purpose: that is exactly what the legacy routes trusted.
  const auth = requireDevice(pool);
  const write = { preHandler: auth, config: { rateLimit: DEVICE_WRITE_LIMIT } };

  app.get('/me/notifications', { preHandler: auth }, async (req) => getNotifications(pool, req.deviceId!));

  app.put('/me/push-token', write, async (req, reply) => {
    const parsed = mePushTokenBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid', field: 'pushToken' });
    await savePushToken(pool, req.deviceId!, parsed.data.pushToken);
    return reply.code(204).send();
  });

  app.post('/me/ping', write, async (req, reply) => {
    const parsed = mePingBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'invalid', field: 'stationId' });
    await pingDevice(pool, req.deviceId!, parsed.data.stationId);
    return reply.code(204).send();
  });
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run && npm run build`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/devices.ts server/test/routes/me.test.ts
git commit -m "feat(server): add token-authenticated /me notifications, push-token and ping"
```

---

### Task 6: Legacy-route sunset switch and the 2.2.0+ share in `/stats`

**Files:**
- Modify: `server/src/routes/index.ts` (`RouteDeps`, the three legacy handlers), `server/src/server.ts` (option passthrough), `server/src/stores/deviceStats.ts`, `server/src/config/env.ts`, `server/src/index.ts`
- Test: `server/test/routes/legacy.test.ts` (create), `server/test/stores/deviceStats.test.ts` (append), `server/test/env.test.ts` (append)

**Interfaces:** Consumes: `registerDevice`. Produces: `BuildServerOptions.legacyDeviceRoutes?: boolean` (default `true`), `RouteDeps.legacyDeviceRoutes?: boolean`, `Env.legacyDeviceRoutes: boolean` from `LEGACY_DEVICE_ROUTES=on|off`, `DeviceStats.auth: { activeWithToken: number; shareOfActive: number }`.

- [ ] **Step 1: Write the failing test**

```ts
// server/test/routes/legacy.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { buildServer } from '../../src/server.js';
import { memPool } from '../helpers/memPool.js';
import { A, H, KEY } from '../helpers/devices.js';

let pool: Pool;
beforeEach(async () => {
  pool = await memPool();
});

const calls = [
  { method: 'POST' as const, url: '/devices/ping', payload: { deviceId: A } },
  { method: 'POST' as const, url: '/devices/push-token', payload: { deviceId: A, pushToken: null } },
  { method: 'GET' as const, url: `/notifications?deviceId=${A}` },
];

describe('legacy device routes', () => {
  it.each(calls)('keep working by default: $method $url', async (call) => {
    const a = await buildServer({ pool, apiKey: KEY });
    const res = await a.inject({ ...call, headers: H });
    expect(res.statusCode).toBeLessThan(300);
    await a.close();
  });

  it.each(calls)('answer 410 once switched off: $method $url', async (call) => {
    const a = await buildServer({ pool, apiKey: KEY, legacyDeviceRoutes: false });
    const res = await a.inject({ ...call, headers: H });
    expect(res.statusCode).toBe(410);
    expect(res.json()).toEqual({ error: 'gone' });
    await a.close();
  });
});
```

Append to `server/test/stores/deviceStats.test.ts` (add `import { registerDevice } from '../../src/stores/deviceTokenStore.js';` at the top; reuse the file's `pool`; uses `pingDevice` already imported there):

```ts
describe('token share', () => {
  it('reports how many active devices already hold a token', async () => {
    const now = new Date('2026-10-13T12:00:00.000Z');
    await pingDevice(pool, '11111111-1111-4111-8111-111111111111', undefined, now);
    await pingDevice(pool, '22222222-2222-4222-8222-222222222222', undefined, now);
    await registerDevice(pool, '22222222-2222-4222-8222-222222222222', 'h', now);

    const stats = await getDeviceStats(pool, now);

    expect(stats.auth).toEqual({ activeWithToken: 1, shareOfActive: 0.5 });
  });

  it('reports a zero share rather than dividing by zero', async () => {
    const stats = await getDeviceStats(pool, new Date('2026-10-13T12:00:00.000Z'));
    expect(stats.auth).toEqual({ activeWithToken: 0, shareOfActive: 0 });
  });
});
```

Append to `server/test/env.test.ts`:

```ts
  it('keeps the legacy device routes on unless told otherwise', () => {
    expect(loadEnv({ DATABASE_URL: 'x', APP_API_KEY: 'k' }).legacyDeviceRoutes).toBe(true);
    expect(loadEnv({ DATABASE_URL: 'x', APP_API_KEY: 'k', LEGACY_DEVICE_ROUTES: 'off' }).legacyDeviceRoutes).toBe(false);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/routes/legacy.test.ts test/stores/deviceStats.test.ts test/env.test.ts`
Expected: FAIL — 410 cases get 204/200; `stats.auth` is undefined; `legacyDeviceRoutes` undefined.

- [ ] **Step 3: Minimal implementation**

`server/src/routes/index.ts` — extend deps and guard the three legacy handlers:

```ts
export interface RouteDeps {
  pool: Pool;
  weatherDeps?: { fetchFn?: typeof fetch };
  refreshFetch?: typeof fetch;
  refreshToken?: string;
  /** Off once 2.2.0+ passes 90 % of active devices (see auth.shareOfActive in /stats). */
  legacyDeviceRoutes?: boolean;
}
```

Inside `registerRoutes`, after `const { pool } = deps;`:

```ts
  const legacy = deps.legacyDeviceRoutes ?? true;
```

and as the first line of each of the `/devices/ping`, `/devices/push-token` and `/notifications` handlers:

```ts
    if (!legacy) return reply.code(410).send({ error: 'gone' });
```

`server/src/server.ts` — add `legacyDeviceRoutes?: boolean;` to `BuildServerOptions` and pass `legacyDeviceRoutes: opts.legacyDeviceRoutes,` in the `registerRoutes` call.

`server/src/stores/deviceStats.ts` — extend the interface and the totals query:

```ts
export interface AuthStats {
  /** Active devices holding a token, i.e. running 2.2.0 or later. */
  activeWithToken: number;
  /** activeWithToken / activeLast7Days, three decimals; 0 when nobody is active. */
  shareOfActive: number;
}

export interface DeviceStats {
  devices: number;
  activeLast7Days: number;
  stations: StationUsage[];
  push: PushStats;
  auth: AuthStats;
}
```

```ts
  const totals = await pool.query(
    // SUM(CASE ...) rather than COUNT(*) FILTER: the filter clause is not
    // supported everywhere the tests run, and silently counted every row.
    `SELECT COUNT(*) AS devices,
            SUM(CASE WHEN last_seen >= $1 THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN last_seen >= $1 AND token_hash IS NOT NULL THEN 1 ELSE 0 END) AS active_tokened
     FROM devices`,
    [since.toISOString()]
  );
```

and in the returned object:

```ts
  const active = Number(totals.rows[0]?.active ?? 0);
  const activeWithToken = Number(totals.rows[0]?.active_tokened ?? 0);
```

```ts
    activeLast7Days: active,
    auth: {
      activeWithToken,
      shareOfActive: active === 0 ? 0 : Math.round((activeWithToken / active) * 1000) / 1000,
    },
```

`server/src/config/env.ts` — add `LEGACY_DEVICE_ROUTES: z.enum(['on', 'off']).optional(),` to the schema, `legacyDeviceRoutes: boolean;` to `Env`, and `legacyDeviceRoutes: parsed.LEGACY_DEVICE_ROUTES !== 'off',` to the return.

`server/src/index.ts` — add `legacyDeviceRoutes: env.legacyDeviceRoutes,` to the `buildServer` options.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run && npm run build`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/index.ts server/src/server.ts server/src/stores/deviceStats.ts server/src/config/env.ts server/src/index.ts server/test/routes/legacy.test.ts server/test/stores/deviceStats.test.ts server/test/env.test.ts
git commit -m "feat(server): switch for sunsetting legacy device routes and token share in /stats"
```

> **Phase 0 boundary.** The server is deployable here (Rollout step 1). Nothing in the app changes; 2.1.x keeps using the legacy routes.

---

# Phase 1 — Feedback backend

### Task 7: Feedback schema and the shared pg-mem helper everywhere

**Files:**
- Modify: `server/src/db/schema.sql` (append)
- Modify: `server/test/db.test.ts` (rewrite), and the pool setup of `server/test/routes.test.ts`, `server/test/cron.test.ts`, `server/test/cronIndex.test.ts`, `server/test/services/dailyPush.test.ts`, `server/test/services/weatherService.test.ts`, `server/test/stores/{newsStore,riverHistory,deviceStats,riverStore,deviceStore,pushStore}.test.ts`

**Interfaces:** Consumes: `memPool()` (Task 2). Produces: tables `feedback_threads`, `feedback_messages`, `admin_audit`, `job_state` exactly as below.

- [ ] **Step 1: Write the failing test**

```ts
// server/test/db.test.ts
import { describe, it, expect } from 'vitest';
import { runMigrations } from '../src/db/index.js';
import { memPool } from './helpers/memPool.js';

const DEVICE = '11111111-1111-4111-8111-111111111111';
const THREAD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

async function withThread() {
  const pool = await memPool();
  await pool.query(`INSERT INTO devices (device_id, first_seen, last_seen) VALUES ($1, now(), now())`, [DEVICE]);
  await pool.query(
    `INSERT INTO feedback_threads (id, device_id, kind, station_id, app_version, os_version, status, created_at, updated_at)
     VALUES ($1, $2, 'bug', 'rosario', '2.2.0', 'android 34', 'open', now(), now())`,
    [THREAD, DEVICE],
  );
  return pool;
}

const insertMessage = (pool: Awaited<ReturnType<typeof withThread>>, id: string, body: string) =>
  pool.query(
    `INSERT INTO feedback_messages (id, thread_id, author, body, created_at) VALUES ($1, $2, 'device', $3, now())`,
    [id, THREAD, body],
  );

describe('runMigrations', () => {
  it('creates all tables', async () => {
    const pool = await memPool();
    const res = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
    );
    const names = res.rows.map((r: { table_name: string }) => r.table_name);
    expect(names).toEqual(expect.arrayContaining([
      'water_levels', 'news', 'weather_cache', 'devices', 'device_station_views',
      'feedback_threads', 'feedback_messages', 'admin_audit', 'job_state',
    ]));
  });

  it('can run again on a database that already has everything', async () => {
    const pool = await memPool();
    await expect(runMigrations(pool)).resolves.toBeUndefined();
  });

  it('limits a message to 2000 code points, not UTF-16 units', async () => {
    const pool = await withThread();
    await expect(insertMessage(pool, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', '😀'.repeat(2000))).resolves.toBeDefined();
    await expect(insertMessage(pool, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'a'.repeat(2001))).rejects.toThrow();
    await expect(insertMessage(pool, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', '')).rejects.toThrow();
  });

  it('rejects a kind the app does not offer', async () => {
    const pool = await withThread();
    await expect(pool.query(
      `INSERT INTO feedback_threads (id, device_id, kind, app_version, os_version, status, created_at, updated_at)
       VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', $1, 'rant', '2.2.0', 'android 34', 'open', now(), now())`,
      [DEVICE],
    )).rejects.toThrow();
  });

  it('deletes messages with their thread', async () => {
    const pool = await withThread();
    await insertMessage(pool, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'hola');
    await pool.query('DELETE FROM feedback_threads WHERE id = $1', [THREAD]);
    const left = await pool.query('SELECT COUNT(*) AS n FROM feedback_messages');
    expect(Number(left.rows[0].n)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/db.test.ts`
Expected: FAIL — `feedback_threads` missing from the table list; inserts fail with `relation "feedback_threads" does not exist`.

- [ ] **Step 3: Minimal implementation**

Append to `server/src/db/schema.sql`:

```sql
-- In-app feedback. A thread belongs to one device; its messages go with it.
CREATE TABLE IF NOT EXISTS feedback_threads (
  id            uuid PRIMARY KEY,
  device_id     uuid NOT NULL REFERENCES devices (device_id),
  kind          text NOT NULL CHECK (kind IN ('suggestion','bug','question')),
  station_id    text NULL,
  app_version   text NOT NULL,
  os_version    text NOT NULL,
  status        text NOT NULL CHECK (status IN ('open','answered','archived')),
  unread_device boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL,
  updated_at    timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS feedback_threads_device
  ON feedback_threads (device_id, updated_at DESC);

-- char_length counts code points, so an emoji is one character here exactly
-- as it is in the validation that runs before the insert.
CREATE TABLE IF NOT EXISTS feedback_messages (
  id         uuid PRIMARY KEY,
  thread_id  uuid NOT NULL REFERENCES feedback_threads (id) ON DELETE CASCADE,
  author     text NOT NULL CHECK (author IN ('device','admin')),
  body       text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS feedback_messages_thread
  ON feedback_messages (thread_id, created_at);

-- Append-only record of what the owner did in the admin. No code path updates
-- or deletes it; production also revokes those privileges (DEPLOY-COOLIFY.md).
CREATE TABLE IF NOT EXISTS admin_audit (
  id        bigserial PRIMARY KEY,
  action    text NOT NULL,
  thread_id uuid NULL,
  at        timestamptz NOT NULL
);

-- Marks for periodic jobs, so a restart neither re-sends nor forgets.
CREATE TABLE IF NOT EXISTS job_state (
  name   text PRIMARY KEY,
  mark   timestamptz NULL,
  ran_at timestamptz NULL
);
```

Move every DB test onto the helper (the `char_length` CHECK above cannot be created by a bare pg-mem instance):

```bash
perl -0pi -e 's/  const mem = newDb\(\);\n  const \{ Pool \} = mem\.adapters\.createPg\(\);\n  pool = new Pool\(\);\n  await runMigrations\(pool\);/  pool = await memPool();/; s/import \{ newDb \} from .pg-mem.;/import { memPool } from \x27.\/helpers\/memPool.js\x27;/' test/routes.test.ts test/cron.test.ts test/cronIndex.test.ts
perl -0pi -e 's/  const mem = newDb\(\);\n  const \{ Pool \} = mem\.adapters\.createPg\(\);\n  pool = new Pool\(\);\n  await runMigrations\(pool\);/  pool = await memPool();/; s/import \{ newDb \} from .pg-mem.;/import { memPool } from \x27..\/helpers\/memPool.js\x27;/' test/services/dailyPush.test.ts test/services/weatherService.test.ts test/stores/newsStore.test.ts test/stores/riverHistory.test.ts test/stores/deviceStats.test.ts test/stores/riverStore.test.ts test/stores/deviceStore.test.ts test/stores/pushStore.test.ts
rg -n "newDb" test
```
Expected `rg` output: only `test/helpers/memPool.ts`. If a file's `runMigrations` import is now unused, delete that import line.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run && npm run build`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/db/schema.sql server/test/db.test.ts server/test/routes.test.ts server/test/cron.test.ts server/test/cronIndex.test.ts server/test/services/dailyPush.test.ts server/test/services/weatherService.test.ts server/test/stores/newsStore.test.ts server/test/stores/riverHistory.test.ts server/test/stores/deviceStats.test.ts server/test/stores/riverStore.test.ts server/test/stores/deviceStore.test.ts server/test/stores/pushStore.test.ts
git commit -m "feat(server): feedback, audit and job-state tables; one pg-mem helper for all tests"
```

---

### Task 8: Device-side feedback store

**Files:**
- Create: `server/src/stores/feedbackStore.ts`
- Test: `server/test/stores/feedbackStore.test.ts`

**Interfaces:** Consumes: tables from Task 7, `registerDevice`. Produces (all exported from `feedbackStore.ts`):
- types `FeedbackKind`, `ThreadStatus`, `Author`, `FeedbackMessage`, `ThreadSummary`, `ThreadDetail`, `NewThread` (shapes as in the API contract; `NewThread = { deviceId; kind; body; stationId: string | null; appVersion; osVersion }`)
- `PREVIEW_CHARS = 140`, `DEDUPE_MS = 60_000`, `preview(body: string): string`, `toMessage(row): FeedbackMessage`
- `createThread(pool, t: NewThread, now?: Date): Promise<ThreadDetail>`
- `addMessage(pool, threadId: string, author: Author, body: string, now?: Date): Promise<FeedbackMessage>`
- `ownsThread(pool, deviceId: string, threadId: string): Promise<boolean>`
- `messagesOf(pool, threadId: string): Promise<FeedbackMessage[]>`
- `firstDeviceBodies(pool, threadIds: string[]): Promise<Map<string, string>>`
- `listThreadsForDevice(pool, deviceId: string): Promise<ThreadSummary[]>`
- `getThreadForDevice(pool, deviceId: string, threadId: string, opts?: { markRead: boolean }): Promise<ThreadDetail | null>`
- `deviceActivitySince(pool, deviceId: string, since: Date): Promise<{ threads: number; messages: number }>`
- `findDuplicateThread(pool, deviceId: string, kind: FeedbackKind, body: string, now: Date): Promise<ThreadDetail | null>`
- `findDuplicateMessage(pool, threadId: string, author: Author, body: string, now: Date): Promise<FeedbackMessage | null>`

- [ ] **Step 1: Write the failing test**

```ts
// server/test/stores/feedbackStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { memPool } from '../helpers/memPool.js';
import { A, B } from '../helpers/devices.js';
import { registerDevice } from '../../src/stores/deviceTokenStore.js';
import {
  addMessage, createThread, deviceActivitySince, findDuplicateMessage, findDuplicateThread,
  getThreadForDevice, listThreadsForDevice, ownsThread, preview,
} from '../../src/stores/feedbackStore.js';

const T0 = new Date('2026-10-13T12:00:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);
let pool: Pool;

beforeEach(async () => {
  pool = await memPool();
  await registerDevice(pool, A, 'ha', T0);
  await registerDevice(pool, B, 'hb', T0);
});

const newThread = (deviceId = A, body = 'El nivel está mal') => ({
  deviceId, kind: 'bug' as const, body, stationId: 'rosario', appVersion: '2.2.0', osVersion: 'android 34',
});

describe('createThread', () => {
  it('opens a thread with its first message', async () => {
    const t = await createThread(pool, newThread(), T0);

    expect(t).toMatchObject({ kind: 'bug', stationId: 'rosario', status: 'open', unread: false, preview: 'El nivel está mal' });
    expect(t.messages).toHaveLength(1);
    expect(t.messages[0]).toMatchObject({ author: 'device', body: 'El nivel está mal', createdAt: T0.toISOString() });
  });
});

describe('ownership', () => {
  it('lets a device read only its own thread', async () => {
    const t = await createThread(pool, newThread(A), T0);

    expect(await ownsThread(pool, A, t.id)).toBe(true);
    expect(await ownsThread(pool, B, t.id)).toBe(false);
    expect(await getThreadForDevice(pool, B, t.id)).toBeNull();
  });

  it('lists only the device own threads, newest activity first', async () => {
    const first = await createThread(pool, newThread(A, 'uno'), T0);
    const second = await createThread(pool, newThread(A, 'dos'), at(1000));
    await createThread(pool, newThread(B, 'ajeno'), at(2000));
    await addMessage(pool, first.id, 'device', 'otra vez', at(3000));

    const list = await listThreadsForDevice(pool, A);

    expect(list.map((t) => t.id)).toEqual([first.id, second.id]);
    expect(list[0].preview).toBe('uno');
  });
});

describe('status and unread', () => {
  it('marks an admin reply answered and unread until the device opens it', async () => {
    const t = await createThread(pool, newThread(), T0);
    await addMessage(pool, t.id, 'admin', 'Gracias, lo corregimos', at(1000));

    expect((await listThreadsForDevice(pool, A))[0]).toMatchObject({ status: 'answered', unread: true });
    const opened = await getThreadForDevice(pool, A, t.id, { markRead: true });
    expect(opened?.unread).toBe(false);
    expect((await listThreadsForDevice(pool, A))[0].unread).toBe(false);
  });

  it('reopens an answered thread when the device writes again', async () => {
    const t = await createThread(pool, newThread(), T0);
    await addMessage(pool, t.id, 'admin', 'Respuesta', at(1000));
    await addMessage(pool, t.id, 'device', 'Sigue mal', at(2000));

    expect((await getThreadForDevice(pool, A, t.id))?.status).toBe('open');
  });
});

describe('limits and dedupe', () => {
  it('counts threads and device messages inside the window only', async () => {
    const old = await createThread(pool, newThread(A, 'vieja'), at(-25 * 3600_000));
    await addMessage(pool, old.id, 'device', 'vieja 2', at(-25 * 3600_000));
    const t = await createThread(pool, newThread(A, 'nueva'), T0);
    await addMessage(pool, t.id, 'admin', 'no cuenta', T0);
    await addMessage(pool, t.id, 'device', 'cuenta', T0);

    expect(await deviceActivitySince(pool, A, at(-24 * 3600_000))).toEqual({ threads: 1, messages: 2 });
  });

  it('recognises a retry of the same new thread within a minute', async () => {
    const t = await createThread(pool, newThread(A, 'igual'), T0);

    expect((await findDuplicateThread(pool, A, 'bug', 'igual', at(59_000)))?.id).toBe(t.id);
    expect(await findDuplicateThread(pool, A, 'bug', 'igual', at(61_000))).toBeNull();
    expect(await findDuplicateThread(pool, A, 'question', 'igual', at(1000))).toBeNull();
    expect(await findDuplicateThread(pool, B, 'bug', 'igual', at(1000))).toBeNull();
  });

  it('recognises a retry of the same last message by the same author', async () => {
    const t = await createThread(pool, newThread(), T0);
    const m = await addMessage(pool, t.id, 'admin', 'hola', at(1000));

    expect((await findDuplicateMessage(pool, t.id, 'admin', 'hola', at(2000)))?.id).toBe(m.id);
    expect(await findDuplicateMessage(pool, t.id, 'device', 'hola', at(2000))).toBeNull();
    expect(await findDuplicateMessage(pool, t.id, 'admin', 'hola', at(62_000))).toBeNull();
  });
});

describe('preview', () => {
  it('keeps 140 code points and marks the cut', () => {
    expect(preview('😀'.repeat(141))).toBe('😀'.repeat(140) + '…');
    expect(preview('corto')).toBe('corto');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/stores/feedbackStore.test.ts`
Expected: FAIL — `Cannot find module '../../src/stores/feedbackStore.js'`.

- [ ] **Step 3: Minimal implementation**

```ts
// server/src/stores/feedbackStore.ts
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

// Feedback threads as the device sees them. Ownership is part of every
// device-facing query: a thread is found by its id AND its device, so a
// guessed id from another phone simply does not exist.

export type FeedbackKind = 'suggestion' | 'bug' | 'question';
export type ThreadStatus = 'open' | 'answered' | 'archived';
export type Author = 'device' | 'admin';

export interface FeedbackMessage {
  id: string;
  author: Author;
  body: string;
  createdAt: string;
}

export interface ThreadSummary {
  id: string;
  kind: FeedbackKind;
  stationId: string | null;
  status: ThreadStatus;
  unread: boolean;
  preview: string;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadDetail extends ThreadSummary {
  messages: FeedbackMessage[];
}

export interface NewThread {
  deviceId: string;
  kind: FeedbackKind;
  body: string;
  stationId: string | null;
  appVersion: string;
  osVersion: string;
}

export const PREVIEW_CHARS = 140;
/** A network retry of the same text inside this window is the same message. */
export const DEDUPE_MS = 60_000;

const iso = (v: unknown): string => new Date(v as string).toISOString();

export function preview(body: string): string {
  const points = [...body];
  return points.length <= PREVIEW_CHARS ? body : points.slice(0, PREVIEW_CHARS).join('') + '…';
}

export function toMessage(r: Record<string, unknown>): FeedbackMessage {
  return { id: String(r.id), author: r.author as Author, body: String(r.body), createdAt: iso(r.created_at) };
}

function toSummary(r: Record<string, unknown>, firstBody: string): ThreadSummary {
  return {
    id: String(r.id),
    kind: r.kind as FeedbackKind,
    stationId: r.station_id == null ? null : String(r.station_id),
    status: r.status as ThreadStatus,
    unread: Boolean(r.unread_device),
    preview: preview(firstBody),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

async function insertMessage(pool: Pool, threadId: string, author: Author, body: string, now: Date): Promise<FeedbackMessage> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO feedback_messages (id, thread_id, author, body, created_at) VALUES ($1, $2, $3, $4, $5)`,
    [id, threadId, author, body, now.toISOString()],
  );
  return { id, author, body, createdAt: now.toISOString() };
}

export async function createThread(pool: Pool, t: NewThread, now: Date = new Date()): Promise<ThreadDetail> {
  const id = randomUUID();
  const ts = now.toISOString();
  await pool.query(
    `INSERT INTO feedback_threads
       (id, device_id, kind, station_id, app_version, os_version, status, unread_device, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'open', false, $7, $7)`,
    [id, t.deviceId, t.kind, t.stationId, t.appVersion, t.osVersion, ts],
  );
  const message = await insertMessage(pool, id, 'device', t.body, now);
  return {
    id, kind: t.kind, stationId: t.stationId, status: 'open', unread: false,
    preview: preview(t.body), createdAt: ts, updatedAt: ts, messages: [message],
  };
}

/** A device writing again reopens the thread; an owner reply answers it and flags it unread on the device. */
export async function addMessage(
  pool: Pool, threadId: string, author: Author, body: string, now: Date = new Date(),
): Promise<FeedbackMessage> {
  const message = await insertMessage(pool, threadId, author, body, now);
  const sql = author === 'device'
    ? `UPDATE feedback_threads SET status = 'open', updated_at = $2 WHERE id = $1`
    : `UPDATE feedback_threads SET status = 'answered', unread_device = true, updated_at = $2 WHERE id = $1`;
  await pool.query(sql, [threadId, now.toISOString()]);
  return message;
}

export async function ownsThread(pool: Pool, deviceId: string, threadId: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT id FROM feedback_threads WHERE id = $1 AND device_id = $2`,
    [threadId, deviceId],
  );
  return res.rows.length === 1;
}

export async function messagesOf(pool: Pool, threadId: string): Promise<FeedbackMessage[]> {
  const res = await pool.query(
    `SELECT id, author, body, created_at FROM feedback_messages WHERE thread_id = $1 ORDER BY created_at ASC`,
    [threadId],
  );
  return res.rows.map(toMessage);
}

export async function firstDeviceBodies(pool: Pool, threadIds: string[]): Promise<Map<string, string>> {
  const first = new Map<string, string>();
  if (threadIds.length === 0) return first;
  const res = await pool.query(
    `SELECT thread_id, body, created_at FROM feedback_messages
      WHERE author = 'device' AND thread_id = ANY($1)
      ORDER BY created_at ASC`,
    [threadIds],
  );
  for (const r of res.rows) {
    const id = String(r.thread_id);
    if (!first.has(id)) first.set(id, String(r.body));
  }
  return first;
}

export async function listThreadsForDevice(pool: Pool, deviceId: string): Promise<ThreadSummary[]> {
  const res = await pool.query(
    `SELECT id, kind, station_id, status, unread_device, created_at, updated_at
       FROM feedback_threads WHERE device_id = $1 ORDER BY updated_at DESC`,
    [deviceId],
  );
  const firsts = await firstDeviceBodies(pool, res.rows.map((r) => String(r.id)));
  return res.rows.map((r) => toSummary(r, firsts.get(String(r.id)) ?? ''));
}

export async function getThreadForDevice(
  pool: Pool, deviceId: string, threadId: string, opts: { markRead: boolean } = { markRead: false },
): Promise<ThreadDetail | null> {
  const res = await pool.query(
    `SELECT id, kind, station_id, status, unread_device, created_at, updated_at
       FROM feedback_threads WHERE id = $1 AND device_id = $2`,
    [threadId, deviceId],
  );
  const row = res.rows[0];
  if (!row) return null;

  if (opts.markRead && row.unread_device) {
    await pool.query(
      `UPDATE feedback_threads SET unread_device = false WHERE id = $1 AND device_id = $2`,
      [threadId, deviceId],
    );
  }

  const messages = await messagesOf(pool, threadId);
  const firstDevice = messages.find((m) => m.author === 'device')?.body ?? '';
  return {
    ...toSummary(row, firstDevice),
    unread: opts.markRead ? false : Boolean(row.unread_device),
    messages,
  };
}

/** Rolling-window counts: instants compared, never calendar days, so time zones cannot shift the limit. */
export async function deviceActivitySince(
  pool: Pool, deviceId: string, since: Date,
): Promise<{ threads: number; messages: number }> {
  const threads = await pool.query(
    `SELECT COUNT(*) AS n FROM feedback_threads WHERE device_id = $1 AND created_at > $2`,
    [deviceId, since.toISOString()],
  );
  const messages = await pool.query(
    `SELECT COUNT(*) AS n FROM feedback_messages m
       JOIN feedback_threads t ON t.id = m.thread_id
      WHERE t.device_id = $1 AND m.author = 'device' AND m.created_at > $2`,
    [deviceId, since.toISOString()],
  );
  return { threads: Number(threads.rows[0]?.n ?? 0), messages: Number(messages.rows[0]?.n ?? 0) };
}

export async function findDuplicateThread(
  pool: Pool, deviceId: string, kind: FeedbackKind, body: string, now: Date,
): Promise<ThreadDetail | null> {
  const res = await pool.query(
    `SELECT id FROM feedback_threads
      WHERE device_id = $1 AND kind = $2 AND created_at > $3
      ORDER BY created_at DESC`,
    [deviceId, kind, new Date(now.getTime() - DEDUPE_MS).toISOString()],
  );
  const ids = res.rows.map((r) => String(r.id));
  const firsts = await firstDeviceBodies(pool, ids);
  const match = ids.find((id) => firsts.get(id) === body);
  return match ? getThreadForDevice(pool, deviceId, match) : null;
}

export async function findDuplicateMessage(
  pool: Pool, threadId: string, author: Author, body: string, now: Date,
): Promise<FeedbackMessage | null> {
  const res = await pool.query(
    `SELECT id, author, body, created_at FROM feedback_messages
      WHERE thread_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [threadId],
  );
  const last = res.rows[0];
  if (!last || last.author !== author || last.body !== body) return null;
  return now.getTime() - new Date(last.created_at).getTime() < DEDUPE_MS ? toMessage(last) : null;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run test/stores/feedbackStore.test.ts && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/stores/feedbackStore.ts server/test/stores/feedbackStore.test.ts
git commit -m "feat(server): feedback store with ownership-scoped reads, rolling counts and retry dedupe"
```

---

### Task 9: Feedback input validation

**Files:**
- Create: `server/src/feedback/validation.ts`
- Test: `server/test/feedback/validation.test.ts`

**Interfaces:** Consumes: `getStationById` (`server/src/config/stations.ts`). Produces: `MAX_BODY_CHARS = 2000`, `codePoints(s: string): number`, `newThreadSchema`, `newMessageSchema`, `type ParseResult<T> = { ok: true; data: T } | { ok: false; field: string }`, `parseInput<S extends z.ZodTypeAny>(schema: S, input: unknown): ParseResult<z.output<S>>`.

- [ ] **Step 1: Write the failing test**

```ts
// server/test/feedback/validation.test.ts
import { describe, it, expect } from 'vitest';
import { newMessageSchema, newThreadSchema, parseInput } from '../../src/feedback/validation.js';

const valid = { kind: 'bug', body: 'Hola', stationId: 'rosario', appVersion: '2.2.0', osVersion: 'android 34' };

describe('newThreadSchema', () => {
  it('accepts a complete thread and trims the body', () => {
    expect(parseInput(newThreadSchema, { ...valid, body: '  Hola  ' })).toEqual({ ok: true, data: { ...valid, body: 'Hola' } });
  });

  it('accepts a thread without a station', () => {
    const { stationId: _s, ...rest } = valid;
    expect(parseInput(newThreadSchema, rest).ok).toBe(true);
  });

  it('counts code points: 2000 emoji fit even though they are 4000 UTF-16 units', () => {
    const body = '😀'.repeat(2000);
    expect(body.length).toBe(4000);
    expect(parseInput(newThreadSchema, { ...valid, body }).ok).toBe(true);
  });

  it.each([
    ['2001 code points', { body: 'a'.repeat(2001) }, 'body'],
    ['whitespace only', { body: ' \n\t ' }, 'body'],
    ['a NUL byte', { body: 'a\u0000b' }, 'body'],
    ['a number body', { body: 42 }, 'body'],
    ['an unknown kind', { kind: 'rant' }, 'kind'],
    ['an unknown station', { stationId: 'atlantis' }, 'stationId'],
    ['markup as version', { appVersion: '<script>' }, 'appVersion'],
    ['markup as os', { osVersion: '<b>x</b>' }, 'osVersion'],
  ])('rejects %s and names the field', (_label, over, field) => {
    expect(parseInput(newThreadSchema, { ...valid, ...over })).toEqual({ ok: false, field });
  });

  it('names body when the payload is not an object', () => {
    expect(parseInput(newThreadSchema, null)).toEqual({ ok: false, field: 'body' });
  });
});

describe('newMessageSchema', () => {
  it('applies the same body rules', () => {
    expect(parseInput(newMessageSchema, { body: ' ok ' })).toEqual({ ok: true, data: { body: 'ok' } });
    expect(parseInput(newMessageSchema, { body: '' })).toEqual({ ok: false, field: 'body' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/feedback/validation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Minimal implementation**

```ts
// server/src/feedback/validation.ts
import { z } from 'zod';
import { getStationById } from '../config/stations.js';

// The body is counted in code points, as Postgres char_length does. zod's
// .max() counts UTF-16 units and would refuse 1001 emoji as "too long".
export const MAX_BODY_CHARS = 2000;

export function codePoints(s: string): number {
  return [...s].length;
}

const body = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => s.length > 0, 'empty')
  .refine((s) => codePoints(s) <= MAX_BODY_CHARS, 'too_long')
  // Postgres text cannot hold NUL; letting it through would be a 500.
  .refine((s) => !s.includes('\u0000'), 'nul');

export const newThreadSchema = z.object({
  kind: z.enum(['suggestion', 'bug', 'question']),
  body,
  stationId: z.string().max(64).refine((id) => Boolean(getStationById(id)), 'unknown_station').optional(),
  appVersion: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}$/),
  osVersion: z.string().regex(/^[A-Za-z0-9 ._-]{1,40}$/),
});

export const newMessageSchema = z.object({ body });

export type ParseResult<T> = { ok: true; data: T } | { ok: false; field: string };

/** The first offending field's name, never its value. */
export function parseInput<S extends z.ZodTypeAny>(schema: S, input: unknown): ParseResult<z.output<S>> {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  const path = result.error.issues[0]?.path[0];
  return { ok: false, field: typeof path === 'string' ? path : 'body' };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run test/feedback/validation.test.ts && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/feedback/validation.ts server/test/feedback/validation.test.ts
git commit -m "feat(server): validate feedback input by code points, naming the field"
```

---

### Task 10: Device feedback routes

**Files:**
- Create: `server/src/routes/feedback.ts`
- Modify: `server/src/routes/index.ts` (`RouteDeps.now`, mount), `server/src/server.ts` (`BuildServerOptions.now`, passthrough)
- Test: `server/test/routes/feedback.test.ts`

**Interfaces:** Consumes: `requireDevice`, `DEVICE_WRITE_LIMIT` (Tasks 4–5); everything from `feedbackStore.ts` (Task 8); `newThreadSchema`, `newMessageSchema`, `parseInput` (Task 9). Produces: `registerFeedbackRoutes(app: FastifyInstance, deps: { pool: Pool; now?: () => Date }): void`, `FEEDBACK_LIMITS = { threadsPerDay: 5, messagesPerDay: 30 }`, `BuildServerOptions.now?: () => Date`; the four routes in the API contract.

- [ ] **Step 1: Write the failing test**

```ts
// server/test/routes/feedback.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { buildServer } from '../../src/server.js';
import { memPool } from '../helpers/memPool.js';
import { A, B, H, KEY, bearer, registerToken } from '../helpers/devices.js';
import { addMessage } from '../../src/stores/feedbackStore.js';

const T0 = new Date('2026-10-13T12:00:00.000Z');
const MIN = 60_000;
const HOUR = 60 * MIN;
let pool: Pool;
let clock: Date;

beforeEach(async () => {
  pool = await memPool();
  clock = T0;
});

const app = () => buildServer({ pool, apiKey: KEY, now: () => clock });
const advance = (ms: number) => { clock = new Date(clock.getTime() + ms); };
const thread = (over: Record<string, unknown> = {}) => ({
  kind: 'bug', body: 'El nivel de Rosario está mal', stationId: 'rosario',
  appVersion: '2.2.0', osVersion: 'android 34', ...over,
});
const post = (a: FastifyInstance, token: string, payload: unknown) =>
  a.inject({ method: 'POST', url: '/feedback', headers: bearer(token), payload: payload as never });
const reply = (a: FastifyInstance, token: string, id: string, body: string) =>
  a.inject({ method: 'POST', url: `/feedback/${id}/messages`, headers: bearer(token), payload: { body } });

describe('POST /feedback', () => {
  it('creates a thread with its first message', async () => {
    const a = await app();
    const token = await registerToken(a, A);

    const res = await post(a, token, thread());

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ kind: 'bug', stationId: 'rosario', status: 'open', unread: false });
    expect(res.json().messages).toEqual([expect.objectContaining({ author: 'device', body: 'El nivel de Rosario está mal' })]);
    await a.close();
  });

  it('needs a device token', async () => {
    const a = await app();
    const res = await a.inject({ method: 'POST', url: '/feedback', headers: H, payload: thread() });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'invalid_token' });
    await a.close();
  });

  it('accepts 2000 emoji and rejects a NUL byte', async () => {
    const a = await app();
    const token = await registerToken(a, A);

    expect((await post(a, token, thread({ body: '😀'.repeat(2000) }))).statusCode).toBe(201);
    const nul = await post(a, token, thread({ body: 'a\u0000b' }));
    expect(nul.statusCode).toBe(400);
    expect(nul.json()).toEqual({ error: 'invalid', field: 'body' });
    await a.close();
  });

  it('names the field without echoing the input', async () => {
    const a = await app();
    const token = await registerToken(a, A);

    const res = await post(a, token, thread({ stationId: '<img src=x onerror=alert(1)>' }));

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'invalid', field: 'stationId' });
    expect(res.body).not.toContain('onerror');
    await a.close();
  });

  it('a retried POST returns the first thread instead of a second one', async () => {
    const a = await app();
    const token = await registerToken(a, A);
    const first = await post(a, token, thread());
    advance(10_000);

    const retry = await post(a, token, thread());

    expect(retry.statusCode).toBe(200);
    expect(retry.json().id).toBe(first.json().id);
    const list = await a.inject({ method: 'GET', url: '/feedback', headers: bearer(token) });
    expect(list.json()).toHaveLength(1);
    await a.close();
  });
});

describe('limits', () => {
  it('allows 5 new threads per rolling 24 h and frees a slot exactly 24 h later', async () => {
    const a = await app();
    const token = await registerToken(a, A);
    for (let i = 0; i < 5; i++) expect((await post(a, token, thread({ body: `hilo ${i}` }))).statusCode).toBe(201);

    const sixth = await post(a, token, thread({ body: 'hilo 6' }));
    expect(sixth.statusCode).toBe(429);
    expect(sixth.json()).toEqual({ error: 'limit', limit: 'threads' });

    advance(24 * HOUR - 1);
    expect((await post(a, token, thread({ body: 'hilo 7' }))).statusCode).toBe(429);
    advance(1);
    expect((await post(a, token, thread({ body: 'hilo 8' }))).statusCode).toBe(201);
    await a.close();
  });

  it('allows 30 device messages per rolling 24 h, first messages included', async () => {
    const a = await app();
    const token = await registerToken(a, A);
    const id = (await post(a, token, thread())).json().id as string;
    for (let i = 0; i < 29; i++) expect((await reply(a, token, id, `mensaje ${i}`)).statusCode).toBe(201);

    const over = await reply(a, token, id, 'uno más');
    expect(over.statusCode).toBe(429);
    expect(over.json()).toEqual({ error: 'limit', limit: 'messages' });
    expect((await post(a, token, thread({ body: 'otro hilo' }))).json()).toEqual({ error: 'limit', limit: 'messages' });
    await a.close();
  });

  it('keeps each device on its own budget', async () => {
    const a = await app();
    const tokenA = await registerToken(a, A);
    const tokenB = await registerToken(a, B);
    for (let i = 0; i < 5; i++) await post(a, tokenA, thread({ body: `hilo ${i}` }));

    expect((await post(a, tokenB, thread())).statusCode).toBe(201);
    await a.close();
  });
});

describe('reading threads', () => {
  it('lists only the device own threads', async () => {
    const a = await app();
    const tokenA = await registerToken(a, A);
    const tokenB = await registerToken(a, B);
    await post(a, tokenA, thread({ body: 'de A' }));
    await post(a, tokenB, thread({ body: 'de B' }));

    const res = await a.inject({ method: 'GET', url: '/feedback', headers: bearer(tokenA) });

    expect(res.json().map((t: { preview: string }) => t.preview)).toEqual(['de A']);
    await a.close();
  });

  it('returns one thread with its messages and clears unread', async () => {
    const a = await app();
    const token = await registerToken(a, A);
    const id = (await post(a, token, thread())).json().id as string;
    await addMessage(pool, id, 'admin', 'Gracias, lo revisamos', clock);

    const listed = await a.inject({ method: 'GET', url: '/feedback', headers: bearer(token) });
    expect(listed.json()[0].unread).toBe(true);

    const res = await a.inject({ method: 'GET', url: `/feedback/${id}`, headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'answered', unread: false });
    expect(res.json().messages.map((m: { author: string }) => m.author)).toEqual(['device', 'admin']);

    const again = await a.inject({ method: 'GET', url: '/feedback', headers: bearer(token) });
    expect(again.json()[0].unread).toBe(false);
    await a.close();
  });

  it('returns 404 for a non-uuid id', async () => {
    const a = await app();
    const token = await registerToken(a, A);
    const res = await a.inject({ method: 'GET', url: '/feedback/not-a-uuid', headers: bearer(token) });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
    await a.close();
  });
});

describe('ownership', () => {
  it('answers 404, never 403, for another device thread, and changes nothing', async () => {
    const a = await app();
    const tokenA = await registerToken(a, A);
    const tokenB = await registerToken(a, B);
    const id = (await post(a, tokenA, thread())).json().id as string;

    const read = await a.inject({ method: 'GET', url: `/feedback/${id}`, headers: bearer(tokenB) });
    const write = await reply(a, tokenB, id, 'me meto');

    expect(read.statusCode).toBe(404);
    expect(read.json()).toEqual({ error: 'not_found' });
    expect(write.statusCode).toBe(404);
    const own = await a.inject({ method: 'GET', url: `/feedback/${id}`, headers: bearer(tokenA) });
    expect(own.json().messages).toHaveLength(1);
    await a.close();
  });
});

describe('POST /feedback/:id/messages', () => {
  it('adds a message and reopens an answered thread', async () => {
    const a = await app();
    const token = await registerToken(a, A);
    const id = (await post(a, token, thread())).json().id as string;
    await addMessage(pool, id, 'admin', 'Respuesta', clock);
    advance(MIN);

    const res = await reply(a, token, id, 'Sigue igual');

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ author: 'device', body: 'Sigue igual' });
    const t = await a.inject({ method: 'GET', url: `/feedback/${id}`, headers: bearer(token) });
    expect(t.json().status).toBe('open');
    await a.close();
  });

  it('a retried message returns the first one', async () => {
    const a = await app();
    const token = await registerToken(a, A);
    const id = (await post(a, token, thread())).json().id as string;
    const first = await reply(a, token, id, 'dos veces');

    const retry = await reply(a, token, id, 'dos veces');

    expect(retry.statusCode).toBe(200);
    expect(retry.json().id).toBe(first.json().id);
    await a.close();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/routes/feedback.test.ts`
Expected: FAIL — routes 404 (`expected 404 to be 201`); TypeScript accepts `now` only after Step 3.

- [ ] **Step 3: Minimal implementation**

```ts
// server/src/routes/feedback.ts
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { requireDevice } from '../auth/requireDevice.js';
import { DEVICE_WRITE_LIMIT } from './devices.js';
import { newMessageSchema, newThreadSchema, parseInput } from '../feedback/validation.js';
import {
  addMessage, createThread, deviceActivitySince, findDuplicateMessage, findDuplicateThread,
  getThreadForDevice, listThreadsForDevice, ownsThread,
} from '../stores/feedbackStore.js';

export const FEEDBACK_LIMITS = { threadsPerDay: 5, messagesPerDay: 30 } as const;
const DAY_MS = 24 * 3600_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface FeedbackRouteDeps {
  pool: Pool;
  now?: () => Date;
}

export function registerFeedbackRoutes(app: FastifyInstance, deps: FeedbackRouteDeps): void {
  const { pool } = deps;
  const now = deps.now ?? (() => new Date());
  const auth = requireDevice(pool);
  const write = { preHandler: auth, config: { rateLimit: DEVICE_WRITE_LIMIT } };
  const notFound = { error: 'not_found' };

  app.post('/feedback', write, async (req, reply) => {
    const parsed = parseInput(newThreadSchema, req.body);
    if (!parsed.ok) return reply.code(400).send({ error: 'invalid', field: parsed.field });
    const deviceId = req.deviceId!;
    const at = now();
    const input = parsed.data;

    // A retry whose first attempt landed is answered with what already exists,
    // before the limit check, so a lost response cannot read as "limit reached".
    const duplicate = await findDuplicateThread(pool, deviceId, input.kind, input.body, at);
    if (duplicate) return reply.code(200).send(duplicate);

    const used = await deviceActivitySince(pool, deviceId, new Date(at.getTime() - DAY_MS));
    if (used.threads >= FEEDBACK_LIMITS.threadsPerDay) return reply.code(429).send({ error: 'limit', limit: 'threads' });
    if (used.messages >= FEEDBACK_LIMITS.messagesPerDay) return reply.code(429).send({ error: 'limit', limit: 'messages' });

    const thread = await createThread(pool, { deviceId, ...input, stationId: input.stationId ?? null }, at);
    return reply.code(201).send(thread);
  });

  app.get('/feedback', { preHandler: auth }, async (req) => listThreadsForDevice(pool, req.deviceId!));

  app.get('/feedback/:id', { preHandler: auth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!UUID.test(id)) return reply.code(404).send(notFound);
    const thread = await getThreadForDevice(pool, req.deviceId!, id, { markRead: true });
    if (!thread) return reply.code(404).send(notFound);
    return thread;
  });

  app.post('/feedback/:id/messages', write, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!UUID.test(id)) return reply.code(404).send(notFound);
    const deviceId = req.deviceId!;
    // Same 404 as a thread that does not exist: whether someone else's id is
    // real is itself information.
    if (!(await ownsThread(pool, deviceId, id))) return reply.code(404).send(notFound);

    const parsed = parseInput(newMessageSchema, req.body);
    if (!parsed.ok) return reply.code(400).send({ error: 'invalid', field: parsed.field });
    const at = now();

    const duplicate = await findDuplicateMessage(pool, id, 'device', parsed.data.body, at);
    if (duplicate) return reply.code(200).send(duplicate);

    const used = await deviceActivitySince(pool, deviceId, new Date(at.getTime() - DAY_MS));
    if (used.messages >= FEEDBACK_LIMITS.messagesPerDay) return reply.code(429).send({ error: 'limit', limit: 'messages' });

    const message = await addMessage(pool, id, 'device', parsed.data.body, at);
    return reply.code(201).send(message);
  });
}
```

`server/src/routes/index.ts`: add `now?: () => Date;` to `RouteDeps`, import `registerFeedbackRoutes` from `./feedback.js`, and after `registerDeviceRoutes(app, { pool });`:

```ts
  registerFeedbackRoutes(app, { pool, now: deps.now });
```

`server/src/server.ts`: add `now?: () => Date;` to `BuildServerOptions` and `now: opts.now,` to the `registerRoutes` call.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run && npm run build`
Expected: all pass.

- [ ] **Step 5: MUTATION-CHECK the ownership check**

```bash
cp src/stores/feedbackStore.ts /tmp/feedbackStore.ts.bak
sd -F 'WHERE id = $1 AND device_id = $2' 'WHERE id = $1 OR device_id = $2' src/stores/feedbackStore.ts
npx vitest run test/routes/feedback.test.ts -t "ownership"
```
Expected: FAIL — `expected 200 to be 404`. Restore and confirm:

```bash
cp /tmp/feedbackStore.ts.bak src/stores/feedbackStore.ts
npx vitest run test/routes/feedback.test.ts
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/feedback.ts server/src/routes/index.ts server/src/server.ts server/test/routes/feedback.test.ts
git commit -m "feat(server): device feedback routes with 404 for foreign threads and rolling limits"
```

---

### Task 11: Reply push to the thread's device

**Files:**
- Create: `server/src/services/expoPush.ts`, `server/src/services/replyPush.ts`
- Test: `server/test/services/replyPush.test.ts`

**Interfaces:** Consumes: `savePushToken`, `subscribers` (pushStore), `createThread`, `addMessage`. Produces: `EXPO_PUSH_URL`, `type PushMessage = { to: string; title: string; body: string; data: Record<string, unknown> }`, `type PushOutcome = 'ok' | 'device_not_registered' | 'failed'`, `sendPush(message: PushMessage, fetchFn?: typeof fetch): Promise<PushOutcome>`; `REPLY_PUSH_TITLE = 'Paraná Info'`, `REPLY_PUSH_BODY = 'Tenés una respuesta a tu mensaje'`, `notifyReply(pool: Pool, threadId: string, deps?: { fetchFn?: typeof fetch; now?: Date }): Promise<PushOutcome | 'no_token'>`.

- [ ] **Step 1: Write the failing test**

```ts
// server/test/services/replyPush.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Pool } from 'pg';
import { memPool } from '../helpers/memPool.js';
import { A } from '../helpers/devices.js';
import { registerDevice } from '../../src/stores/deviceTokenStore.js';
import { savePushToken, subscribers } from '../../src/stores/pushStore.js';
import { addMessage, createThread } from '../../src/stores/feedbackStore.js';
import { notifyReply } from '../../src/services/replyPush.js';

const PUSH = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const SECRET_REPLY = 'RESPUESTA PRIVADA DEL DUEÑO';
let pool: Pool;
let threadId: string;

beforeEach(async () => {
  pool = await memPool();
  await registerDevice(pool, A, 'h');
  const t = await createThread(pool, { deviceId: A, kind: 'question', body: '¿Hay datos de Goya?', stationId: null, appVersion: '2.2.0', osVersion: 'android 34' });
  threadId = t.id;
  await addMessage(pool, threadId, 'admin', SECRET_REPLY);
});

const expo = (ticket: unknown, status = 200) =>
  vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    new Response(JSON.stringify({ data: [ticket] }), { status }));

describe('notifyReply', () => {
  it('announces the reply without ever carrying its text', async () => {
    await savePushToken(pool, A, PUSH);
    const fetchFn = expo({ status: 'ok' });

    expect(await notifyReply(pool, threadId, { fetchFn: fetchFn as unknown as typeof fetch })).toBe('ok');

    const [, init] = fetchFn.mock.calls[0];
    const sent = JSON.parse(String(init?.body));
    expect(sent).toEqual([{
      to: PUSH,
      title: 'Paraná Info',
      body: 'Tenés una respuesta a tu mensaje',
      data: { type: 'feedback_reply', threadId },
    }]);
    expect(String(init?.body)).not.toContain(SECRET_REPLY);
  });

  it('does nothing when the device has no push token', async () => {
    const fetchFn = expo({ status: 'ok' });
    expect(await notifyReply(pool, threadId, { fetchFn: fetchFn as unknown as typeof fetch })).toBe('no_token');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('clears a token Expo says is no longer registered', async () => {
    await savePushToken(pool, A, PUSH);
    const fetchFn = expo({ status: 'error', details: { error: 'DeviceNotRegistered' } });

    expect(await notifyReply(pool, threadId, { fetchFn: fetchFn as unknown as typeof fetch })).toBe('device_not_registered');
    expect(await subscribers(pool)).toEqual([]);
  });

  it('reports failure, without throwing, when Expo is down', async () => {
    await savePushToken(pool, A, PUSH);
    const down = vi.fn(async () => new Response('bad gateway', { status: 502 }));
    const offline = vi.fn(async () => { throw new Error('ECONNRESET'); });

    expect(await notifyReply(pool, threadId, { fetchFn: down as unknown as typeof fetch })).toBe('failed');
    expect(await notifyReply(pool, threadId, { fetchFn: offline as unknown as typeof fetch })).toBe('failed');
  });

  it('treats an unknown thread as having nobody to notify', async () => {
    expect(await notifyReply(pool, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe('no_token');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/services/replyPush.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Minimal implementation**

```ts
// server/src/services/expoPush.ts
// One message through Expo's push service. The daily digest batches; a reply
// is one message to one device, and only its outcome matters.
export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

export type PushOutcome = 'ok' | 'device_not_registered' | 'failed';

export async function sendPush(message: PushMessage, fetchFn: typeof fetch = fetch): Promise<PushOutcome> {
  try {
    const res = await fetchFn(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify([message]),
    });
    if (!res.ok) return 'failed';
    const body = (await res.json()) as { data?: Array<{ status?: string; details?: { error?: string } }> };
    const ticket = body.data?.[0];
    if (ticket?.status === 'ok') return 'ok';
    return ticket?.details?.error === 'DeviceNotRegistered' ? 'device_not_registered' : 'failed';
  } catch {
    return 'failed';
  }
}
```

```ts
// server/src/services/replyPush.ts
import type { Pool } from 'pg';
import { savePushToken } from '../stores/pushStore.js';
import { sendPush, type PushOutcome } from './expoPush.js';

export const REPLY_PUSH_TITLE = 'Paraná Info';
// Never the reply itself: a lock screen is not a private place.
export const REPLY_PUSH_BODY = 'Tenés una respuesta a tu mensaje';

export async function notifyReply(
  pool: Pool,
  threadId: string,
  deps: { fetchFn?: typeof fetch; now?: Date } = {},
): Promise<PushOutcome | 'no_token'> {
  const res = await pool.query(
    `SELECT d.device_id, d.push_token
       FROM feedback_threads t JOIN devices d ON d.device_id = t.device_id
      WHERE t.id = $1`,
    [threadId],
  );
  const row = res.rows[0];
  // No token: the reply still lands, and the unread dot covers it next time
  // the reader opens the screen.
  if (!row?.push_token) return 'no_token';

  const outcome = await sendPush(
    {
      to: String(row.push_token),
      title: REPLY_PUSH_TITLE,
      body: REPLY_PUSH_BODY,
      data: { type: 'feedback_reply', threadId },
    },
    deps.fetchFn,
  );
  if (outcome === 'device_not_registered') {
    await savePushToken(pool, String(row.device_id), null, deps.now ?? new Date());
  }
  return outcome;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run test/services/replyPush.test.ts && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/expoPush.ts server/src/services/replyPush.ts server/test/services/replyPush.test.ts
git commit -m "feat(server): reply push that announces an answer without its text"
```

---

### Task 12: Debounced owner email through Resend

**Files:**
- Create: `server/src/stores/jobState.ts`, `server/src/services/ownerEmail.ts`
- Test: `server/test/stores/jobState.test.ts`, `server/test/services/ownerEmail.test.ts`

**Interfaces:** Consumes: `createThread`, `addMessage`, `preview`, `PREVIEW_CHARS`, `getStationById`. Produces: `getJobState(pool, name: string): Promise<{ mark: Date | null; ranAt: Date | null }>`, `saveJobState(pool, name: string, state: { mark: Date | null; ranAt: Date }): Promise<void>`; `EMAIL_JOB = 'owner_email'`, `EMAIL_DEBOUNCE_MS = 15 * 60_000`, `MAX_THREADS_IN_EMAIL = 20`, `RESEND_URL`, `interface OwnerEmailConfig { apiKey: string; to: string; from: string; adminBaseUrl: string; fetchFn?: typeof fetch }`, `interface PendingEmail { total: number; newest: Date | null; threads: PendingThread[] }`, `pendingForEmail(pool, since: Date | null)`, `composeOwnerEmail(p: PendingEmail, adminBaseUrl: string): { subject: string; text: string }`, `type EmailTickResult = { status: 'sent' | 'nothing_new' | 'debounced' | 'failed'; messages: number }`, `runOwnerEmailTick(pool, cfg: OwnerEmailConfig, now?: Date): Promise<EmailTickResult>`, `ownerEmailConfigFromEnv(env: { resendApiKey: string | null; feedbackNotifyEmail: string; feedbackFromEmail: string; adminBaseUrl: string }): OwnerEmailConfig | null`.

- [ ] **Step 1: Write the failing test**

```ts
// server/test/stores/jobState.test.ts
import { describe, it, expect } from 'vitest';
import { memPool } from '../helpers/memPool.js';
import { getJobState, saveJobState } from '../../src/stores/jobState.js';

describe('jobState', () => {
  it('starts empty and keeps what was saved', async () => {
    const pool = await memPool();
    expect(await getJobState(pool, 'x')).toEqual({ mark: null, ranAt: null });

    const mark = new Date('2026-10-13T12:00:00.000Z');
    const ranAt = new Date('2026-10-13T12:05:00.000Z');
    await saveJobState(pool, 'x', { mark, ranAt });
    await saveJobState(pool, 'x', { mark, ranAt });

    expect(await getJobState(pool, 'x')).toEqual({ mark, ranAt });
  });
});
```

```ts
// server/test/services/ownerEmail.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Pool } from 'pg';
import { memPool } from '../helpers/memPool.js';
import { A } from '../helpers/devices.js';
import { registerDevice } from '../../src/stores/deviceTokenStore.js';
import { addMessage, createThread } from '../../src/stores/feedbackStore.js';
import { ownerEmailConfigFromEnv, runOwnerEmailTick, type OwnerEmailConfig } from '../../src/services/ownerEmail.js';

const T0 = new Date('2026-10-13T12:00:00.000Z');
const MIN = 60_000;
const at = (ms: number) => new Date(T0.getTime() + ms);
let pool: Pool;

beforeEach(async () => {
  pool = await memPool();
  await registerDevice(pool, A, 'h', T0);
});

const resend = (status = 200) => vi.fn(async (_u: string | URL | Request, _i?: RequestInit) => new Response('{"id":"x"}', { status }));
const config = (fetchFn: ReturnType<typeof resend>): OwnerEmailConfig => ({
  apiKey: 're_test',
  to: 'garassino@gmail.com',
  from: 'Paraná Info <avisos@rioparana.com.ar>',
  adminBaseUrl: 'http://100.89.213.31:3100',
  fetchFn: fetchFn as unknown as typeof fetch,
});
const sent = (fetchFn: ReturnType<typeof resend>, call = 0) => JSON.parse(String(fetchFn.mock.calls[call][1]?.body));
const newThread = (body: string, when: Date, stationId: string | null = 'rosario') =>
  createThread(pool, { deviceId: A, kind: 'bug', body, stationId, appVersion: '2.2.0', osVersion: 'android 34' }, when);

describe('runOwnerEmailTick', () => {
  it('sends nothing when there is nothing new', async () => {
    const fetchFn = resend();
    expect(await runOwnerEmailTick(pool, config(fetchFn), T0)).toEqual({ status: 'nothing_new', messages: 0 });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('sends one plain-text email for new device messages', async () => {
    const t = await newThread('El nivel de Rosario está mal', T0);
    await addMessage(pool, t.id, 'device', 'Y no actualiza', at(MIN));
    const fetchFn = resend();

    expect(await runOwnerEmailTick(pool, config(fetchFn), at(5 * MIN))).toEqual({ status: 'sent', messages: 2 });

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer re_test');
    const body = sent(fetchFn);
    expect(body).toMatchObject({ from: 'Paraná Info <avisos@rioparana.com.ar>', to: ['garassino@gmail.com'], subject: 'Paraná Info: 2 mensaje(s) nuevo(s)' });
    expect(body.html).toBeUndefined();
    expect(body.text).toContain('[Error] Rosario · 2 mensaje(s)');
    expect(body.text).toContain('El nivel de Rosario está mal');
    expect(body.text).toContain(`http://100.89.213.31:3100/admin/threads/${t.id}`);
  });

  it('ignores the owner own replies', async () => {
    const t = await newThread('Hola', T0);
    await runOwnerEmailTick(pool, config(resend()), at(MIN));
    await addMessage(pool, t.id, 'admin', 'Respuesta', at(20 * MIN));

    expect((await runOwnerEmailTick(pool, config(resend()), at(40 * MIN))).status).toBe('nothing_new');
  });

  it('waits 15 minutes after an email before sending the next', async () => {
    await newThread('primero', T0);
    await runOwnerEmailTick(pool, config(resend()), at(MIN));
    await newThread('segundo', at(2 * MIN));
    const fetchFn = resend();

    expect(await runOwnerEmailTick(pool, config(fetchFn), at(6 * MIN))).toEqual({ status: 'debounced', messages: 1 });
    expect(await runOwnerEmailTick(pool, config(fetchFn), at(16 * MIN))).toEqual({ status: 'sent', messages: 1 });
    expect(sent(fetchFn).text).toContain('segundo');
    expect(sent(fetchFn).text).not.toContain('primero');
  });

  it('keeps the mark when Resend fails, and retries on the next tick', async () => {
    await newThread('no se pierde', T0);
    const down = resend(503);
    const up = resend();

    expect((await runOwnerEmailTick(pool, config(down), at(5 * MIN))).status).toBe('failed');
    expect(await runOwnerEmailTick(pool, config(up), at(10 * MIN))).toEqual({ status: 'sent', messages: 1 });
  });

  it('treats a network error as a failed send', async () => {
    await newThread('x', T0);
    const offline = vi.fn(async () => { throw new Error('ENOTFOUND api.resend.com'); });
    const cfg = { ...config(resend()), fetchFn: offline as unknown as typeof fetch };
    expect((await runOwnerEmailTick(pool, cfg, at(MIN))).status).toBe('failed');
  });

  it('sends one email after six hours of failures, capped at 20 threads', async () => {
    for (let i = 0; i < 25; i++) await newThread(`hilo ${i}`, at(i * 1000));
    const down = resend(500);
    for (let tick = 1; tick <= 72; tick++) await runOwnerEmailTick(pool, config(down), at(tick * 5 * MIN));
    const up = resend();

    expect(await runOwnerEmailTick(pool, config(up), at(73 * 5 * MIN))).toEqual({ status: 'sent', messages: 25 });
    expect(up).toHaveBeenCalledTimes(1);
    const text = sent(up).text as string;
    expect(sent(up).subject).toBe('Paraná Info: 25 mensaje(s) nuevo(s)');
    expect(text.match(/\/admin\/threads\//g)).toHaveLength(20);
    expect(text).toContain('…y 5 conversación(es) más');
  });

  it('cuts each preview at 140 characters and names a missing station', async () => {
    await newThread('😀'.repeat(150), T0, null);
    const fetchFn = resend();
    await runOwnerEmailTick(pool, config(fetchFn), at(MIN));
    const text = sent(fetchFn).text as string;
    expect(text).toContain('😀'.repeat(140) + '…');
    expect(text).not.toContain('😀'.repeat(141));
    expect(text).toContain('[Error] Sin estación');
  });
});

describe('ownerEmailConfigFromEnv', () => {
  const env = { resendApiKey: 're_x', feedbackNotifyEmail: 'garassino@gmail.com', feedbackFromEmail: 'Paraná Info <avisos@rioparana.com.ar>', adminBaseUrl: 'http://100.89.213.31:3100' };

  it('is disabled without an API key', () => {
    expect(ownerEmailConfigFromEnv({ ...env, resendApiKey: null })).toBeNull();
  });

  it('carries the env values otherwise', () => {
    expect(ownerEmailConfigFromEnv(env)).toEqual({ apiKey: 're_x', to: 'garassino@gmail.com', from: 'Paraná Info <avisos@rioparana.com.ar>', adminBaseUrl: 'http://100.89.213.31:3100' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/stores/jobState.test.ts test/services/ownerEmail.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Minimal implementation**

```ts
// server/src/stores/jobState.ts
import type { Pool } from 'pg';

export interface JobState {
  mark: Date | null;
  ranAt: Date | null;
}

const asDate = (v: unknown): Date | null => (v == null ? null : new Date(v as string));

export async function getJobState(pool: Pool, name: string): Promise<JobState> {
  const res = await pool.query(`SELECT mark, ran_at FROM job_state WHERE name = $1`, [name]);
  const row = res.rows[0];
  return { mark: asDate(row?.mark), ranAt: asDate(row?.ran_at) };
}

export async function saveJobState(pool: Pool, name: string, state: { mark: Date | null; ranAt: Date }): Promise<void> {
  await pool.query(
    `INSERT INTO job_state (name, mark, ran_at) VALUES ($1, $2, $3)
     ON CONFLICT (name) DO UPDATE SET mark = EXCLUDED.mark, ran_at = EXCLUDED.ran_at`,
    [name, state.mark?.toISOString() ?? null, state.ranAt.toISOString()],
  );
}
```

```ts
// server/src/services/ownerEmail.ts
import type { Pool } from 'pg';
import { getStationById } from '../config/stations.js';
import { preview, type FeedbackKind } from '../stores/feedbackStore.js';
import { getJobState, saveJobState } from '../stores/jobState.js';

// The owner hears about new messages by email, at most every 15 minutes. The
// mark of what was already announced moves only after Resend accepted the
// email, so an outage delays the news but never drops it.

export const EMAIL_JOB = 'owner_email';
export const EMAIL_DEBOUNCE_MS = 15 * 60_000;
export const MAX_THREADS_IN_EMAIL = 20;
export const RESEND_URL = 'https://api.resend.com/emails';

const KIND_LABELS: Record<FeedbackKind, string> = { suggestion: 'Sugerencia', bug: 'Error', question: 'Consulta' };

export interface OwnerEmailConfig {
  apiKey: string;
  to: string;
  from: string;
  adminBaseUrl: string;
  fetchFn?: typeof fetch;
}

export interface PendingThread {
  threadId: string;
  kind: FeedbackKind;
  stationId: string | null;
  count: number;
  /** The first of the new messages in this thread. */
  firstBody: string;
}

export interface PendingEmail {
  total: number;
  newest: Date | null;
  threads: PendingThread[];
}

export interface EmailTickResult {
  status: 'sent' | 'nothing_new' | 'debounced' | 'failed';
  messages: number;
}

export function ownerEmailConfigFromEnv(env: {
  resendApiKey: string | null;
  feedbackNotifyEmail: string;
  feedbackFromEmail: string;
  adminBaseUrl: string;
}): OwnerEmailConfig | null {
  if (!env.resendApiKey) return null;
  return { apiKey: env.resendApiKey, to: env.feedbackNotifyEmail, from: env.feedbackFromEmail, adminBaseUrl: env.adminBaseUrl };
}

export async function pendingForEmail(pool: Pool, since: Date | null): Promise<PendingEmail> {
  const res = await pool.query(
    `SELECT m.thread_id, m.body, m.created_at, t.kind, t.station_id
       FROM feedback_messages m JOIN feedback_threads t ON t.id = m.thread_id
      WHERE m.author = 'device' AND m.created_at > $1
      ORDER BY m.created_at ASC`,
    [(since ?? new Date(0)).toISOString()],
  );

  const threads = new Map<string, PendingThread>();
  let newest: Date | null = null;
  for (const r of res.rows) {
    const id = String(r.thread_id);
    const existing = threads.get(id);
    if (existing) existing.count++;
    else threads.set(id, { threadId: id, kind: r.kind as FeedbackKind, stationId: r.station_id == null ? null : String(r.station_id), count: 1, firstBody: String(r.body) });
    newest = new Date(r.created_at);
  }
  return { total: res.rows.length, newest, threads: [...threads.values()] };
}

export function composeOwnerEmail(p: PendingEmail, adminBaseUrl: string): { subject: string; text: string } {
  const shown = p.threads.slice(0, MAX_THREADS_IN_EMAIL);
  const blocks = shown.map((t) => {
    const station = t.stationId ? getStationById(t.stationId)?.name ?? t.stationId : 'Sin estación';
    return [
      `[${KIND_LABELS[t.kind]}] ${station} · ${t.count} mensaje(s)`,
      preview(t.firstBody),
      `${adminBaseUrl}/admin/threads/${t.threadId}`,
    ].join('\n');
  });
  const hidden = p.threads.length - shown.length;
  const lines = [`${p.total} mensaje(s) nuevo(s) en Paraná Info.`, '', blocks.join('\n\n')];
  if (hidden > 0) lines.push('', `…y ${hidden} conversación(es) más.`);
  lines.push('', `Bandeja: ${adminBaseUrl}/admin`);
  return { subject: `Paraná Info: ${p.total} mensaje(s) nuevo(s)`, text: lines.join('\n') };
}

async function sendViaResend(cfg: OwnerEmailConfig, subject: string, text: string): Promise<boolean> {
  try {
    const res = await (cfg.fetchFn ?? fetch)(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: cfg.from, to: [cfg.to], subject, text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function runOwnerEmailTick(pool: Pool, cfg: OwnerEmailConfig, now: Date = new Date()): Promise<EmailTickResult> {
  const state = await getJobState(pool, EMAIL_JOB);
  const pending = await pendingForEmail(pool, state.mark);
  if (pending.total === 0) return { status: 'nothing_new', messages: 0 };
  if (state.ranAt && now.getTime() - state.ranAt.getTime() < EMAIL_DEBOUNCE_MS) {
    return { status: 'debounced', messages: pending.total };
  }

  const { subject, text } = composeOwnerEmail(pending, cfg.adminBaseUrl);
  if (!(await sendViaResend(cfg, subject, text))) return { status: 'failed', messages: pending.total };

  await saveJobState(pool, EMAIL_JOB, { mark: pending.newest, ranAt: now });
  return { status: 'sent', messages: pending.total };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run test/stores/jobState.test.ts test/services/ownerEmail.test.ts && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/stores/jobState.ts server/src/services/ownerEmail.ts server/test/stores/jobState.test.ts server/test/services/ownerEmail.test.ts
git commit -m "feat(server): debounced owner email via Resend that never drops messages on failure"
```

---

### Task 13: Retention purge, the 5-minute feedback job, and env wiring

**Files:**
- Create: `server/src/services/feedbackRetention.ts`, `server/src/feedbackScheduler.ts`
- Modify: `server/src/config/env.ts`, `server/src/index.ts` (whole file shown below)
- Test: `server/test/services/feedbackRetention.test.ts`, `server/test/feedbackScheduler.test.ts`, `server/test/env.test.ts` (append)

**Interfaces:** Consumes: `runOwnerEmailTick`, `ownerEmailConfigFromEnv`, `EmailTickResult` (Task 12). Produces: `RETENTION_MONTHS = 12`, `retentionCutoff(now: Date): Date`, `purgeOldThreads(pool, now?: Date): Promise<number>`; `FEEDBACK_TICK_MS = 5 * 60_000`, `PURGE_EVERY_MS = 24 * 3600_000`, `startFeedbackJobs(opts: FeedbackJobOptions): () => void` with `FeedbackJobOptions = { intervalMs?: number; emailTick: (() => Promise<EmailTickResult>) | null; purge: () => Promise<number>; now?: () => Date; log?: (msg: string) => void }`; `Env.resendApiKey: string | null`, `Env.feedbackNotifyEmail`, `Env.feedbackFromEmail`, `Env.adminBaseUrl`.

- [ ] **Step 1: Write the failing test**

```ts
// server/test/services/feedbackRetention.test.ts
import { describe, it, expect } from 'vitest';
import { memPool } from '../helpers/memPool.js';
import { A } from '../helpers/devices.js';
import { registerDevice } from '../../src/stores/deviceTokenStore.js';
import { createThread } from '../../src/stores/feedbackStore.js';
import { purgeOldThreads, retentionCutoff } from '../../src/services/feedbackRetention.js';

const NOW = new Date('2026-10-13T12:00:00.000Z');

describe('purgeOldThreads', () => {
  it('deletes threads idle for more than 12 months, with their messages', async () => {
    const pool = await memPool();
    await registerDevice(pool, A, 'h');
    const base = { deviceId: A, kind: 'bug' as const, stationId: null, appVersion: '2.2.0', osVersion: 'android 34' };
    await createThread(pool, { ...base, body: 'vieja' }, new Date('2025-10-12T11:59:59.000Z'));
    const kept = await createThread(pool, { ...base, body: 'reciente' }, new Date('2025-10-13T12:00:01.000Z'));

    expect(await purgeOldThreads(pool, NOW)).toBe(1);

    const threads = await pool.query('SELECT id FROM feedback_threads');
    expect(threads.rows.map((r) => String(r.id))).toEqual([kept.id]);
    const messages = await pool.query('SELECT COUNT(*) AS n FROM feedback_messages');
    expect(Number(messages.rows[0].n)).toBe(1);
  });

  it('puts the cutoff twelve calendar months back', () => {
    expect(retentionCutoff(NOW).toISOString()).toBe('2025-10-13T12:00:00.000Z');
  });
});
```

```ts
// server/test/feedbackScheduler.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FEEDBACK_TICK_MS, startFeedbackJobs } from '../src/feedbackScheduler.js';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const T0 = new Date('2026-10-13T12:00:00.000Z');

describe('startFeedbackJobs', () => {
  it('ticks the owner email every five minutes', async () => {
    const emailTick = vi.fn(async () => ({ status: 'nothing_new' as const, messages: 0 }));
    const stop = startFeedbackJobs({ emailTick, purge: vi.fn(async () => 0), now: () => T0, log: () => {} });

    await vi.advanceTimersByTimeAsync(FEEDBACK_TICK_MS * 3);

    expect(FEEDBACK_TICK_MS).toBe(5 * 60_000);
    expect(emailTick).toHaveBeenCalledTimes(3);
    stop();
  });

  it('still purges when email is disabled', async () => {
    const purge = vi.fn(async () => 0);
    const stop = startFeedbackJobs({ emailTick: null, purge, now: () => T0, log: () => {} });

    await vi.advanceTimersByTimeAsync(FEEDBACK_TICK_MS);

    expect(purge).toHaveBeenCalledTimes(1);
    stop();
  });

  it('purges once a day, not every tick', async () => {
    let now = T0;
    const purge = vi.fn(async () => 0);
    const stop = startFeedbackJobs({ emailTick: null, purge, now: () => now, log: () => {} });

    for (let i = 0; i < 12; i++) { now = new Date(now.getTime() + FEEDBACK_TICK_MS); await vi.advanceTimersByTimeAsync(FEEDBACK_TICK_MS); }
    expect(purge).toHaveBeenCalledTimes(1);

    now = new Date(T0.getTime() + 24 * 3600_000 + FEEDBACK_TICK_MS);
    await vi.advanceTimersByTimeAsync(FEEDBACK_TICK_MS);
    expect(purge).toHaveBeenCalledTimes(2);
    stop();
  });

  it('keeps running after the email tick throws, and logs the failure', async () => {
    const log = vi.fn();
    const emailTick = vi.fn(async () => { throw new Error('db down'); });
    const purge = vi.fn(async () => 0);
    const stop = startFeedbackJobs({ emailTick, purge, now: () => T0, log });

    await vi.advanceTimersByTimeAsync(FEEDBACK_TICK_MS * 2);

    expect(emailTick).toHaveBeenCalledTimes(2);
    expect(purge).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('owner email tick failed'));
    stop();
  });

  it('logs a failed send so an outage is visible', async () => {
    const log = vi.fn();
    const emailTick = vi.fn(async () => ({ status: 'failed' as const, messages: 3 }));
    const stop = startFeedbackJobs({ emailTick, purge: vi.fn(async () => 0), now: () => T0, log });

    await vi.advanceTimersByTimeAsync(FEEDBACK_TICK_MS);

    expect(log).toHaveBeenCalledWith(expect.stringContaining('owner email not sent (3 pending)'));
    stop();
  });

  it('does not overlap a slow tick', async () => {
    let release!: () => void;
    const emailTick = vi.fn(() => new Promise<{ status: 'sent'; messages: number }>((r) => { release = () => r({ status: 'sent', messages: 1 }); }));
    const stop = startFeedbackJobs({ emailTick, purge: vi.fn(async () => 0), now: () => T0, log: () => {} });

    await vi.advanceTimersByTimeAsync(FEEDBACK_TICK_MS * 3);
    expect(emailTick).toHaveBeenCalledTimes(1);
    release();
    stop();
  });
});
```

Append to `server/test/env.test.ts`:

```ts
  it('defaults the feedback email settings and disables email without a key', () => {
    const env = loadEnv({ DATABASE_URL: 'x', APP_API_KEY: 'k' });
    expect(env).toMatchObject({
      resendApiKey: null,
      feedbackNotifyEmail: 'garassino@gmail.com',
      feedbackFromEmail: 'Paraná Info <avisos@rioparana.com.ar>',
      adminBaseUrl: 'http://100.89.213.31:3100',
    });
  });

  it('reads the Resend key and overrides', () => {
    const env = loadEnv({ DATABASE_URL: 'x', APP_API_KEY: 'k', RESEND_API_KEY: 're_1', FEEDBACK_NOTIFY_EMAIL: 'o@x.ar' });
    expect(env.resendApiKey).toBe('re_1');
    expect(env.feedbackNotifyEmail).toBe('o@x.ar');
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/services/feedbackRetention.test.ts test/feedbackScheduler.test.ts test/env.test.ts`
Expected: FAIL — modules not found; env fields undefined.

- [ ] **Step 3: Minimal implementation**

```ts
// server/src/services/feedbackRetention.ts
import type { Pool } from 'pg';

// The privacy policy promises 12 months after the last activity on a thread.
export const RETENTION_MONTHS = 12;

export function retentionCutoff(now: Date): Date {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - RETENTION_MONTHS);
  return cutoff;
}

/** Deletes idle threads; their messages go by ON DELETE CASCADE. Returns how many threads went. */
export async function purgeOldThreads(pool: Pool, now: Date = new Date()): Promise<number> {
  const res = await pool.query(
    `DELETE FROM feedback_threads WHERE updated_at < $1 RETURNING id`,
    [retentionCutoff(now).toISOString()],
  );
  return res.rows.length;
}
```

```ts
// server/src/feedbackScheduler.ts
import type { EmailTickResult } from './services/ownerEmail.js';

export const FEEDBACK_TICK_MS = 5 * 60_000;
export const PURGE_EVERY_MS = 24 * 3600_000;

export interface FeedbackJobOptions {
  intervalMs?: number;
  /** Null when RESEND_API_KEY is missing: the purge still runs. */
  emailTick: (() => Promise<EmailTickResult>) | null;
  purge: () => Promise<number>;
  now?: () => Date;
  log?: (msg: string) => void;
}

// Separate from the 15-minute river refresh: the email promise is "within
// about 20 minutes", and a slow PNA scrape must not hold it up.
export function startFeedbackJobs(opts: FeedbackJobOptions): () => void {
  const intervalMs = opts.intervalMs ?? FEEDBACK_TICK_MS;
  const now = opts.now ?? (() => new Date());
  const log = opts.log ?? ((msg: string) => console.log(msg));
  let inFlight = false;
  let purgedAt: Date | null = null;

  async function tick(): Promise<void> {
    if (opts.emailTick) {
      try {
        const result = await opts.emailTick();
        if (result.status === 'failed') log(`[feedback] owner email not sent (${result.messages} pending); retrying next tick`);
        if (result.status === 'sent') log(`[feedback] owner email sent (${result.messages} messages)`);
      } catch (err) {
        log(`[feedback] owner email tick failed: ${(err as Error).message}`);
      }
    }

    const at = now();
    if (!purgedAt || at.getTime() - purgedAt.getTime() >= PURGE_EVERY_MS) {
      purgedAt = at;
      try {
        const removed = await opts.purge();
        if (removed > 0) log(`[feedback] purged ${removed} thread(s) past retention`);
      } catch (err) {
        log(`[feedback] purge failed: ${(err as Error).message}`);
      }
    }
  }

  const timer = setInterval(() => {
    if (inFlight) return;
    inFlight = true;
    tick().finally(() => {
      inFlight = false;
    });
  }, intervalMs);
  timer.unref?.();

  return () => clearInterval(timer);
}
```

`server/src/config/env.ts` — add to the schema:

```ts
  RESEND_API_KEY: z.string().optional(),
  FEEDBACK_NOTIFY_EMAIL: z.string().optional(),
  FEEDBACK_FROM_EMAIL: z.string().optional(),
  ADMIN_BASE_URL: z.string().optional(),
```

to `Env`:

```ts
  resendApiKey: string | null;
  feedbackNotifyEmail: string;
  feedbackFromEmail: string;
  /** Where the admin is reached, used for links in the owner email. */
  adminBaseUrl: string;
```

and to the returned object:

```ts
    resendApiKey: parsed.RESEND_API_KEY ?? null,
    feedbackNotifyEmail: parsed.FEEDBACK_NOTIFY_EMAIL ?? 'garassino@gmail.com',
    feedbackFromEmail: parsed.FEEDBACK_FROM_EMAIL ?? 'Paraná Info <avisos@rioparana.com.ar>',
    adminBaseUrl: (parsed.ADMIN_BASE_URL ?? 'http://100.89.213.31:3100').replace(/\/$/, ''),
```

(Deliberately lenient: a malformed email setting must disable the email, not stop the API from booting.)

```ts
// server/src/index.ts
import { loadEnv } from './config/env.js';
import { createPool, runMigrations } from './db/index.js';
import { buildServer } from './server.js';
import { refreshAll, startRefreshScheduler } from './scheduler.js';
import { startFeedbackJobs } from './feedbackScheduler.js';
import { ownerEmailConfigFromEnv, runOwnerEmailTick } from './services/ownerEmail.js';
import { purgeOldThreads } from './services/feedbackRetention.js';

async function main() {
  const env = loadEnv();
  const pool = createPool(env.databaseUrl);
  await runMigrations(pool);
  const app = await buildServer({
    pool,
    apiKey: env.apiKey,
    rateLimit: true,
    refreshToken: process.env.REFRESH_TOKEN,
    logger: { level: env.logLevel },
    legacyDeviceRoutes: env.legacyDeviceRoutes,
  });
  await app.listen({ port: env.port, host: '0.0.0.0' });
  console.log(`[server] listening on ${env.port}`);
  // warm caches in the background so a slow origin can't block boot / healthcheck
  refreshAll(pool)
    .then(() => console.log('[server] initial cache warm complete'))
    .catch((e) => console.error('[server] cache warm error', e));

  // keep them warm from here on; nothing external drives the refresh
  startRefreshScheduler(pool);
  console.log('[server] refresh scheduler started');

  const emailConfig = ownerEmailConfigFromEnv(env);
  if (!emailConfig) console.log('[feedback] RESEND_API_KEY not set: owner email disabled');
  startFeedbackJobs({
    emailTick: emailConfig ? () => runOwnerEmailTick(pool, emailConfig) : null,
    purge: () => purgeOldThreads(pool),
  });
  console.log('[feedback] jobs started (email every 5 min, purge daily)');
}

main().catch((err) => {
  console.error('[server] fatal', err);
  process.exit(1);
});
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run && npm run build`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/feedbackRetention.ts server/src/feedbackScheduler.ts server/src/config/env.ts server/src/index.ts server/test/services/feedbackRetention.test.ts server/test/feedbackScheduler.test.ts server/test/env.test.ts
git commit -m "feat(server): 5-minute feedback job for owner email and 12-month purge"
```

> **Phase 1 boundary.** Deployable: the feedback API works, owner email is off until `RESEND_API_KEY` is set. No admin yet, so replies cannot be written — do not ship the app before Phase 2.

---

# Phase 2 — Owner admin (tailnet only)

### Task 14: Escape-by-default HTML template

**Files:**
- Create: `server/src/admin/html.ts`
- Test: `server/test/admin/html.test.ts`

**Interfaces:** Consumes: nothing. Produces: `interface SafeHtml { readonly value: string }` (branded), `escapeHtml(s: string): string`, `` html`…` `` tagged template returning `SafeHtml`. There is intentionally no `raw()`.

- [ ] **Step 1: Write the failing test**

```ts
// server/test/admin/html.test.ts
import { describe, it, expect } from 'vitest';
import { escapeHtml, html } from '../../src/admin/html.js';

describe('html', () => {
  it('escapes every interpolated string', () => {
    const body = `<script>alert("x")</script> & 'y'`;
    expect(html`<p>${body}</p>`.value).toBe(
      '<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;</p>',
    );
  });

  it('cannot be broken out of an attribute', () => {
    const value = `" onmouseover="alert(1)`;
    expect(html`<input value="${value}">`.value).toBe('<input value="&quot; onmouseover=&quot;alert(1)">');
  });

  it('does not escape nested templates twice', () => {
    const inner = html`<b>${'<i>'}</b>`;
    expect(html`<p>${inner}</p>`.value).toBe('<p><b>&lt;i&gt;</b></p>');
  });

  it('joins lists and drops null, undefined and false', () => {
    const items = ['<a>', 'b'].map((s) => html`<li>${s}</li>`);
    expect(html`<ul>${items}${null}${undefined}${false}</ul>`.value).toBe('<ul><li>&lt;a&gt;</li><li>b</li></ul>');
  });

  it('treats an object that only looks safe as text', () => {
    const forged = { value: '<script>' };
    expect(html`${forged}`.value).toBe('[object Object]');
  });

  it('escapes numbers as text', () => {
    expect(html`${42}`.value).toBe('42');
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/admin/html.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Minimal implementation**

```ts
// server/src/admin/html.ts
// The admin renders text people typed into the app. Every interpolation is
// escaped; the only thing inserted as-is is another html`` result, and there
// is deliberately no way to mark a plain string as safe.

const SAFE: unique symbol = Symbol('safe-html');

export interface SafeHtml {
  readonly [SAFE]: true;
  readonly value: string;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSafe(v: unknown): v is SafeHtml {
  return typeof v === 'object' && v !== null && (v as { [SAFE]?: unknown })[SAFE] === true;
}

function render(v: unknown): string {
  if (v === null || v === undefined || v === false) return '';
  if (Array.isArray(v)) return v.map(render).join('');
  if (isSafe(v)) return v.value;
  return escapeHtml(String(v));
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  let out = strings[0];
  values.forEach((v, i) => {
    out += render(v) + strings[i + 1];
  });
  return { [SAFE]: true, value: out };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run test/admin/html.test.ts && npm run build`
Expected: PASS.

- [ ] **Step 5: MUTATION-CHECK the escaping**

```bash
cp src/admin/html.ts /tmp/html.ts.bak
sd -F 'return escapeHtml(String(v));' 'return String(v);' src/admin/html.ts
npx vitest run test/admin/html.test.ts
```
Expected: FAIL — `<script>` appears unescaped. Restore:

```bash
cp /tmp/html.ts.bak src/admin/html.ts
npx vitest run test/admin/html.test.ts
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/admin/html.ts server/test/admin/html.test.ts
git commit -m "feat(admin): escape-by-default html template with no unsafe escape hatch"
```

---

### Task 15: Sessions, lockout, password hashing and the hash CLI

**Files:**
- Modify: `server/package.json`, `server/package-lock.json` (`@node-rs/argon2`)
- Create: `server/src/admin/sessions.ts`, `server/src/admin/lockout.ts`, `server/src/admin/password.ts`, `server/src/admin/hashPassword.ts`
- Test: `server/test/admin/sessions.test.ts`, `server/test/admin/lockout.test.ts`, `server/test/admin/password.test.ts`

**Interfaces:** Consumes: nothing. Produces: `SESSION_TTL_MS = 12 * 3600_000`, `interface AdminSession { id: string; csrf: string; expiresAt: number }`, `interface SessionStore { create(): AdminSession; get(id: string | undefined): AdminSession | null; destroy(id: string | undefined): void }`, `createSessionStore(opts?: { now?: () => number; ttlMs?: number }): SessionStore`; `MAX_FAILURES = 5`, `LOCK_MS = 15 * 60_000`, `interface Lockout { isLocked(): boolean; recordFailure(): void; recordSuccess(): void }`, `createLockout(opts?: { now?: () => number; maxFailures?: number; lockMs?: number }): Lockout`; `hashPassword(pw: string): Promise<string>`, `verifyPassword(stored: string, candidate: string): Promise<boolean>`.

- [ ] **Step 1: Write the failing test**

```ts
// server/test/admin/sessions.test.ts
import { describe, it, expect } from 'vitest';
import { createSessionStore, SESSION_TTL_MS } from '../../src/admin/sessions.js';

describe('createSessionStore', () => {
  it('issues unguessable, distinct session ids and csrf tokens', () => {
    const store = createSessionStore();
    const a = store.create();
    const b = store.create();
    expect(a.id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.csrf).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Set([a.id, a.csrf, b.id, b.csrf]).size).toBe(4);
  });

  it('keeps a session for 12 hours and not a millisecond more', () => {
    let t = 0;
    const store = createSessionStore({ now: () => t });
    const s = store.create();

    t = SESSION_TTL_MS - 1;
    expect(store.get(s.id)).toEqual(s);
    t = SESSION_TTL_MS;
    expect(store.get(s.id)).toBeNull();
    expect(SESSION_TTL_MS).toBe(12 * 3600_000);
  });

  it('forgets a session on logout', () => {
    const store = createSessionStore();
    const s = store.create();
    store.destroy(s.id);
    expect(store.get(s.id)).toBeNull();
  });

  it('returns null for a missing or unknown id', () => {
    const store = createSessionStore();
    expect(store.get(undefined)).toBeNull();
    expect(store.get('nope')).toBeNull();
  });
});
```

```ts
// server/test/admin/lockout.test.ts
import { describe, it, expect } from 'vitest';
import { createLockout, LOCK_MS, MAX_FAILURES } from '../../src/admin/lockout.js';

describe('createLockout', () => {
  it('locks for 15 minutes after the fifth failure', () => {
    let t = 0;
    const lock = createLockout({ now: () => t });
    for (let i = 0; i < MAX_FAILURES - 1; i++) lock.recordFailure();
    expect(lock.isLocked()).toBe(false);

    lock.recordFailure();
    expect(lock.isLocked()).toBe(true);
    t = LOCK_MS - 1;
    expect(lock.isLocked()).toBe(true);
    t = LOCK_MS;
    expect(lock.isLocked()).toBe(false);
    expect([MAX_FAILURES, LOCK_MS]).toEqual([5, 15 * 60_000]);
  });

  it('starts counting again after a success', () => {
    const lock = createLockout();
    for (let i = 0; i < 4; i++) lock.recordFailure();
    lock.recordSuccess();
    lock.recordFailure();
    expect(lock.isLocked()).toBe(false);
  });
});
```

```ts
// server/test/admin/password.test.ts
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/admin/password.js';

describe('password', () => {
  it('hashes with argon2id and verifies only the right password', async () => {
    const stored = await hashPassword('correct horse battery staple');
    expect(stored.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(stored, 'correct horse battery staple')).toBe(true);
    expect(await verifyPassword(stored, 'wrong')).toBe(false);
  });

  it('answers false, not an exception, for a corrupt stored hash', async () => {
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/admin/sessions.test.ts test/admin/lockout.test.ts test/admin/password.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Minimal implementation**

```bash
npm install @node-rs/argon2@^2.0.2
```

```ts
// server/src/admin/sessions.ts
import { randomBytes } from 'node:crypto';

// Server-side sessions for the single owner. In memory on purpose: one
// process, one person, and a restart that logs them out costs nothing.
export const SESSION_TTL_MS = 12 * 3600_000;

export interface AdminSession {
  id: string;
  csrf: string;
  expiresAt: number;
}

export interface SessionStore {
  create(): AdminSession;
  get(id: string | undefined): AdminSession | null;
  destroy(id: string | undefined): void;
}

const token = () => randomBytes(32).toString('base64url');

export function createSessionStore(opts: { now?: () => number; ttlMs?: number } = {}): SessionStore {
  const now = opts.now ?? Date.now;
  const ttl = opts.ttlMs ?? SESSION_TTL_MS;
  const sessions = new Map<string, AdminSession>();

  return {
    create() {
      for (const [id, s] of sessions) if (s.expiresAt <= now()) sessions.delete(id);
      const session = { id: token(), csrf: token(), expiresAt: now() + ttl };
      sessions.set(session.id, session);
      return session;
    },
    get(id) {
      if (!id) return null;
      const session = sessions.get(id);
      if (!session) return null;
      if (session.expiresAt <= now()) {
        sessions.delete(id);
        return null;
      }
      return session;
    },
    destroy(id) {
      if (id) sessions.delete(id);
    },
  };
}
```

```ts
// server/src/admin/lockout.ts
// Keyed on the account, not the IP: there is one account, and an attacker on
// the tailnet can change IP more easily than the owner can change password.
export const MAX_FAILURES = 5;
export const LOCK_MS = 15 * 60_000;

export interface Lockout {
  isLocked(): boolean;
  recordFailure(): void;
  recordSuccess(): void;
}

export function createLockout(opts: { now?: () => number; maxFailures?: number; lockMs?: number } = {}): Lockout {
  const now = opts.now ?? Date.now;
  const max = opts.maxFailures ?? MAX_FAILURES;
  const lockMs = opts.lockMs ?? LOCK_MS;
  let failures = 0;
  let lockedUntil = 0;

  return {
    isLocked: () => now() < lockedUntil,
    recordFailure() {
      failures++;
      if (failures >= max) {
        lockedUntil = now() + lockMs;
        failures = 0;
      }
    },
    recordSuccess() {
      failures = 0;
    },
  };
}
```

```ts
// server/src/admin/password.ts
import { hash, verify } from '@node-rs/argon2';

// @node-rs/argon2 defaults to argon2id. Prebuilt binaries cover linux x64 and
// arm64 glibc, so node:20-slim needs no build tools.
export async function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(stored: string, candidate: string): Promise<boolean> {
  try {
    return await verify(stored, candidate);
  } catch {
    return false;
  }
}
```

```ts
// server/src/admin/hashPassword.ts
// Prints the argon2id hash for ADMIN_PASSWORD_HASH. Reads the password from
// stdin so it never lands in shell history or `ps` output.
//   read -rs PW && printf '%s\n' "$PW" | npx tsx src/admin/hashPassword.ts; unset PW
import { createInterface } from 'node:readline';
import { hashPassword } from './password.js';

const rl = createInterface({ input: process.stdin });
rl.once('line', async (line) => {
  rl.close();
  if (line.length < 12) {
    console.error('Use at least 12 characters.');
    process.exit(1);
  }
  console.log(await hashPassword(line));
});
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run test/admin && npm run build && printf '%s\n' 'a-long-test-password' | npx tsx src/admin/hashPassword.ts && npm audit --omit=dev --audit-level=high`
Expected: tests PASS; the CLI prints one line starting with `$argon2id$v=19$`; audit exits 0.

- [ ] **Step 5: Commit**

```bash
git add server/package.json server/package-lock.json server/src/admin/sessions.ts server/src/admin/lockout.ts server/src/admin/password.ts server/src/admin/hashPassword.ts server/test/admin/sessions.test.ts server/test/admin/lockout.test.ts server/test/admin/password.test.ts
git commit -m "feat(admin): sessions, account lockout and argon2id password hashing"
```

---

### Task 16: Admin store and append-only audit

**Files:**
- Create: `server/src/stores/adminAudit.ts`, `server/src/stores/feedbackAdminStore.ts`
- Test: `server/test/stores/adminAudit.test.ts`, `server/test/stores/feedbackAdminStore.test.ts`

**Interfaces:** Consumes: `addMessage`, `findDuplicateMessage`, `firstDeviceBodies`, `messagesOf`, `preview`, `createThread`, types from `feedbackStore.ts`. Produces: `type AuditAction = 'login' | 'login_failed' | 'reply' | 'archive'`, `recordAudit(pool, action: AuditAction, threadId: string | null, at?: Date): Promise<void>`, `listAudit(pool, limit?: number): Promise<Array<{ action: AuditAction; threadId: string | null; at: string }>>`; `type InboxFilter = 'pending' | 'answered' | 'archived' | 'errors'`, `INBOX_FILTERS: InboxFilter[]`, `interface InboxRow { id; kind; stationId: string | null; status; preview; updatedAt; shortDevice }`, `listInbox(pool, filter: InboxFilter, limit?: number): Promise<InboxRow[]>`, `interface AdminThreadDetail { id; kind; stationId; status; appVersion; osVersion; shortDevice; deviceThreadCount: number; createdAt; messages: FeedbackMessage[] }`, `getThreadForAdmin(pool, threadId: string): Promise<AdminThreadDetail | null>`, `type ReplyResult = 'sent' | 'duplicate' | 'not_found'`, `replyAsAdmin(pool, threadId: string, body: string, now?: Date): Promise<ReplyResult>`, `archiveThread(pool, threadId: string, now?: Date): Promise<boolean>`.

- [ ] **Step 1: Write the failing test**

```ts
// server/test/stores/adminAudit.test.ts
import { describe, it, expect } from 'vitest';
import { memPool } from '../helpers/memPool.js';
import * as audit from '../../src/stores/adminAudit.js';

describe('adminAudit', () => {
  it('appends entries in order', async () => {
    const pool = await memPool();
    await audit.recordAudit(pool, 'login_failed', null, new Date('2026-10-13T12:00:00.000Z'));
    await audit.recordAudit(pool, 'reply', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', new Date('2026-10-13T12:01:00.000Z'));

    expect(await audit.listAudit(pool)).toEqual([
      { action: 'login_failed', threadId: null, at: '2026-10-13T12:00:00.000Z' },
      { action: 'reply', threadId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', at: '2026-10-13T12:01:00.000Z' },
    ]);
  });

  it('offers no way to change or remove an entry', () => {
    expect(Object.keys(audit).sort()).toEqual(['listAudit', 'recordAudit']);
  });
});
```

```ts
// server/test/stores/feedbackAdminStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { memPool } from '../helpers/memPool.js';
import { A, B } from '../helpers/devices.js';
import { registerDevice } from '../../src/stores/deviceTokenStore.js';
import { addMessage, createThread, type FeedbackKind } from '../../src/stores/feedbackStore.js';
import { listAudit } from '../../src/stores/adminAudit.js';
import { archiveThread, getThreadForAdmin, listInbox, replyAsAdmin } from '../../src/stores/feedbackAdminStore.js';

const T0 = new Date('2026-10-13T12:00:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);
let pool: Pool;

beforeEach(async () => {
  pool = await memPool();
  await registerDevice(pool, A, 'ha', T0);
  await registerDevice(pool, B, 'hb', T0);
});

const make = (body: string, kind: FeedbackKind = 'suggestion', deviceId = A, when = T0) =>
  createThread(pool, { deviceId, kind, body, stationId: 'rosario', appVersion: '2.2.0', osVersion: 'android 34' }, when);

describe('listInbox', () => {
  it('splits threads into the four filters', async () => {
    const open = await make('abierto', 'suggestion', A, at(1));
    const answered = await make('respondido', 'question', A, at(2));
    await addMessage(pool, answered.id, 'admin', 'ok', at(3));
    const archived = await make('archivado', 'bug', A, at(4));
    await archiveThread(pool, archived.id, at(5));
    const bug = await make('error abierto', 'bug', B, at(6));

    const ids = async (f: Parameters<typeof listInbox>[1]) => (await listInbox(pool, f)).map((r) => r.id);
    expect(await ids('pending')).toEqual([bug.id, open.id]);
    expect(await ids('answered')).toEqual([answered.id]);
    expect(await ids('archived')).toEqual([archived.id]);
    expect(await ids('errors')).toEqual([bug.id]);
  });

  it('shows a preview and a short device id, never the full one', async () => {
    await make('😀'.repeat(150));
    const [row] = await listInbox(pool, 'pending');
    expect(row.preview).toBe('😀'.repeat(140) + '…');
    expect(row.shortDevice).toBe(A.slice(0, 8));
  });
});

describe('getThreadForAdmin', () => {
  it('returns the thread with its device context', async () => {
    const t = await make('primero');
    await make('segundo');

    const detail = await getThreadForAdmin(pool, t.id);

    expect(detail).toMatchObject({
      id: t.id, kind: 'suggestion', stationId: 'rosario', status: 'open',
      appVersion: '2.2.0', osVersion: 'android 34', shortDevice: A.slice(0, 8), deviceThreadCount: 2,
    });
    expect(detail?.messages.map((m) => m.body)).toEqual(['primero']);
  });

  it('returns null for an unknown thread', async () => {
    expect(await getThreadForAdmin(pool, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBeNull();
  });
});

describe('replyAsAdmin', () => {
  it('stores the reply, marks the thread answered and unread, and audits it', async () => {
    const t = await make('pregunta');

    expect(await replyAsAdmin(pool, t.id, 'respuesta', at(1000))).toBe('sent');

    const detail = await getThreadForAdmin(pool, t.id);
    expect(detail?.status).toBe('answered');
    expect(detail?.messages.at(-1)).toMatchObject({ author: 'admin', body: 'respuesta' });
    const unread = await pool.query('SELECT unread_device FROM feedback_threads WHERE id = $1', [t.id]);
    expect(unread.rows[0].unread_device).toBe(true);
    expect(await listAudit(pool)).toEqual([{ action: 'reply', threadId: t.id, at: at(1000).toISOString() }]);
  });

  it('stores a double-submitted reply once', async () => {
    const t = await make('pregunta');
    await replyAsAdmin(pool, t.id, 'respuesta', at(1000));

    expect(await replyAsAdmin(pool, t.id, 'respuesta', at(2000))).toBe('duplicate');
    expect((await getThreadForAdmin(pool, t.id))?.messages).toHaveLength(2);
    expect(await listAudit(pool)).toHaveLength(1);
  });

  it('reports an unknown thread', async () => {
    expect(await replyAsAdmin(pool, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'x')).toBe('not_found');
  });
});

describe('archiveThread', () => {
  it('archives without replying and audits it', async () => {
    const t = await make('ruido');
    expect(await archiveThread(pool, t.id, at(1))).toBe(true);
    expect((await getThreadForAdmin(pool, t.id))?.status).toBe('archived');
    expect((await listAudit(pool)).map((e) => e.action)).toEqual(['archive']);
  });

  it('reports an unknown thread without auditing', async () => {
    expect(await archiveThread(pool, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe(false);
    expect(await listAudit(pool)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/stores/adminAudit.test.ts test/stores/feedbackAdminStore.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Minimal implementation**

```ts
// server/src/stores/adminAudit.ts
import type { Pool } from 'pg';

// Append-only. This module exports an insert and a read and nothing else; the
// production database role additionally lacks UPDATE/DELETE on the table.
export type AuditAction = 'login' | 'login_failed' | 'reply' | 'archive';

export async function recordAudit(
  pool: Pool, action: AuditAction, threadId: string | null, at: Date = new Date(),
): Promise<void> {
  await pool.query(
    `INSERT INTO admin_audit (action, thread_id, at) VALUES ($1, $2, $3)`,
    [action, threadId, at.toISOString()],
  );
}

export async function listAudit(
  pool: Pool, limit = 100,
): Promise<Array<{ action: AuditAction; threadId: string | null; at: string }>> {
  const res = await pool.query(`SELECT action, thread_id, at FROM admin_audit ORDER BY id ASC LIMIT $1`, [limit]);
  return res.rows.map((r) => ({
    action: r.action as AuditAction,
    threadId: r.thread_id == null ? null : String(r.thread_id),
    at: new Date(r.at).toISOString(),
  }));
}
```

```ts
// server/src/stores/feedbackAdminStore.ts
import type { Pool } from 'pg';
import { recordAudit } from './adminAudit.js';
import {
  addMessage, findDuplicateMessage, firstDeviceBodies, messagesOf, preview,
  type FeedbackKind, type FeedbackMessage, type ThreadStatus,
} from './feedbackStore.js';

// The owner's view: every thread, no ownership filter. Only the admin
// instance, which never listens publicly, imports this module.

export type InboxFilter = 'pending' | 'answered' | 'archived' | 'errors';
export const INBOX_FILTERS: InboxFilter[] = ['pending', 'answered', 'archived', 'errors'];

// Fixed SQL per filter. The filter is a closed union checked by the route,
// never user text, so interpolating one of these four strings is safe.
const WHERE: Record<InboxFilter, string> = {
  pending: `status = 'open'`,
  answered: `status = 'answered'`,
  archived: `status = 'archived'`,
  errors: `kind = 'bug' AND status <> 'archived'`,
};

export interface InboxRow {
  id: string;
  kind: FeedbackKind;
  stationId: string | null;
  status: ThreadStatus;
  preview: string;
  updatedAt: string;
  shortDevice: string;
}

export interface AdminThreadDetail {
  id: string;
  kind: FeedbackKind;
  stationId: string | null;
  status: ThreadStatus;
  appVersion: string;
  osVersion: string;
  shortDevice: string;
  deviceThreadCount: number;
  createdAt: string;
  messages: FeedbackMessage[];
}

export type ReplyResult = 'sent' | 'duplicate' | 'not_found';

const iso = (v: unknown) => new Date(v as string).toISOString();

export async function listInbox(pool: Pool, filter: InboxFilter, limit = 200): Promise<InboxRow[]> {
  const res = await pool.query(
    `SELECT id, device_id, kind, station_id, status, updated_at
       FROM feedback_threads WHERE ${WHERE[filter]}
      ORDER BY updated_at DESC LIMIT $1`,
    [limit],
  );
  const firsts = await firstDeviceBodies(pool, res.rows.map((r) => String(r.id)));
  return res.rows.map((r) => ({
    id: String(r.id),
    kind: r.kind as FeedbackKind,
    stationId: r.station_id == null ? null : String(r.station_id),
    status: r.status as ThreadStatus,
    preview: preview(firsts.get(String(r.id)) ?? ''),
    updatedAt: iso(r.updated_at),
    shortDevice: String(r.device_id).slice(0, 8),
  }));
}

export async function getThreadForAdmin(pool: Pool, threadId: string): Promise<AdminThreadDetail | null> {
  const res = await pool.query(
    `SELECT id, device_id, kind, station_id, status, app_version, os_version, created_at
       FROM feedback_threads WHERE id = $1`,
    [threadId],
  );
  const r = res.rows[0];
  if (!r) return null;
  const count = await pool.query(`SELECT COUNT(*) AS n FROM feedback_threads WHERE device_id = $1`, [r.device_id]);
  return {
    id: String(r.id),
    kind: r.kind as FeedbackKind,
    stationId: r.station_id == null ? null : String(r.station_id),
    status: r.status as ThreadStatus,
    appVersion: String(r.app_version),
    osVersion: String(r.os_version),
    shortDevice: String(r.device_id).slice(0, 8),
    deviceThreadCount: Number(count.rows[0]?.n ?? 0),
    createdAt: iso(r.created_at),
    messages: await messagesOf(pool, threadId),
  };
}

export async function replyAsAdmin(pool: Pool, threadId: string, body: string, now: Date = new Date()): Promise<ReplyResult> {
  const exists = await pool.query(`SELECT id FROM feedback_threads WHERE id = $1`, [threadId]);
  if (!exists.rows[0]) return 'not_found';
  // A double-click or a resubmitted form must not answer twice or push twice.
  if (await findDuplicateMessage(pool, threadId, 'admin', body, now)) return 'duplicate';
  await addMessage(pool, threadId, 'admin', body, now);
  await recordAudit(pool, 'reply', threadId, now);
  return 'sent';
}

export async function archiveThread(pool: Pool, threadId: string, now: Date = new Date()): Promise<boolean> {
  const res = await pool.query(
    `UPDATE feedback_threads SET status = 'archived', updated_at = $2 WHERE id = $1 RETURNING id`,
    [threadId, now.toISOString()],
  );
  if (!res.rows[0]) return false;
  await recordAudit(pool, 'archive', threadId, now);
  return true;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run test/stores && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/stores/adminAudit.ts server/src/stores/feedbackAdminStore.ts server/test/stores/adminAudit.test.ts server/test/stores/feedbackAdminStore.test.ts
git commit -m "feat(admin): inbox filters, thread detail, reply and archive with an append-only audit"
```

---

### Task 17: Admin views

**Files:**
- Create: `server/src/admin/views.ts`
- Test: `server/test/admin/views.test.ts`

**Interfaces:** Consumes: `html`, `SafeHtml` (Task 14); `InboxFilter`, `InboxRow`, `AdminThreadDetail` (Task 16); `getStationById`. Produces: `FILTER_LABELS`, `KIND_LABELS`, `ADMIN_CSS: string`, `formatArDate(iso: string): string`, `loginPage(o: { csrf: string; message?: string }): string`, `inboxPage(o: { filter: InboxFilter; rows: InboxRow[]; csrf: string }): string`, `threadPage(o: { thread: AdminThreadDetail; csrf: string; message?: string }): string`, `notFoundPage(): string`.

- [ ] **Step 1: Write the failing test**

```ts
// server/test/admin/views.test.ts
import { describe, it, expect } from 'vitest';
import { formatArDate, inboxPage, loginPage, notFoundPage, threadPage } from '../../src/admin/views.js';
import type { AdminThreadDetail, InboxRow } from '../../src/stores/feedbackAdminStore.js';

const EVIL = `<script>alert("x")</script>`;
const row: InboxRow = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', kind: 'bug', stationId: 'rosario', status: 'open',
  preview: EVIL, updatedAt: '2026-10-13T15:00:00.000Z', shortDevice: '11111111',
};
const thread: AdminThreadDetail = {
  id: row.id, kind: 'bug', stationId: 'rosario', status: 'answered', appVersion: '2.2.0', osVersion: 'android 34',
  shortDevice: '11111111', deviceThreadCount: 3, createdAt: '2026-10-13T15:00:00.000Z',
  messages: [
    { id: 'm1', author: 'device', body: EVIL, createdAt: '2026-10-13T15:00:00.000Z' },
    { id: 'm2', author: 'admin', body: 'Gracias & saludos', createdAt: '2026-10-13T15:10:00.000Z' },
  ],
};

describe('admin views', () => {
  it('renders stored text in the inbox as text', () => {
    const page = inboxPage({ filter: 'pending', rows: [row], csrf: 'c' });
    expect(page).not.toContain('<script>alert');
    expect(page).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  });

  it('renders stored text in a thread as text', () => {
    const page = threadPage({ thread, csrf: 'c' });
    expect(page).not.toContain('<script>alert');
    expect(page).toContain('Gracias &amp; saludos');
  });

  it('shows the four filters and marks the active one', () => {
    const page = inboxPage({ filter: 'errors', rows: [], csrf: 'c' });
    for (const label of ['Sin responder', 'Respondidos', 'Archivados', 'Errores']) expect(page).toContain(label);
    expect(page).toContain('href="/admin?filter=errors" class="tab active"');
  });

  it('shows the device context and signs owner replies as Paraná Info', () => {
    const page = threadPage({ thread, csrf: 'c' });
    expect(page).toContain('Rosario');
    expect(page).toContain('11111111 (3 conversaciones)');
    expect(page).toContain('2.2.0');
    expect(page).toContain('android 34');
    expect(page).toContain('Paraná Info ·');
  });

  it('puts the csrf token in every form', () => {
    const page = threadPage({ thread, csrf: 'TOKEN123' });
    const forms = page.match(/<form /g) ?? [];
    const tokens = page.match(/name="_csrf" value="TOKEN123"/g) ?? [];
    expect(forms.length).toBe(3); // logout, reply, archive
    expect(tokens.length).toBe(forms.length);
  });

  it('hides "Archivar sin responder" on an archived thread', () => {
    expect(threadPage({ thread: { ...thread, status: 'archived' }, csrf: 'c' })).not.toContain('Archivar sin responder');
  });

  it('escapes a login message and loads only same-origin CSS', () => {
    const page = loginPage({ csrf: 'c', message: EVIL });
    expect(page).not.toContain('<script>alert');
    expect(page).toContain('<link rel="stylesheet" href="/admin/assets/admin.css">');
    expect(page).not.toMatch(/<style|style="/);
  });

  it('formats dates in Argentine time', () => {
    expect(formatArDate('2026-10-13T03:30:00.000Z')).toMatch(/13\/10.*00:30/);
  });

  it('has a plain 404 page', () => {
    expect(notFoundPage()).toContain('No encontrado');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/admin/views.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Minimal implementation**

```ts
// server/src/admin/views.ts
import { html, type SafeHtml } from './html.js';
import { getStationById } from '../config/stations.js';
import type { AdminThreadDetail, InboxFilter, InboxRow } from '../stores/feedbackAdminStore.js';
import type { FeedbackKind, ThreadStatus } from '../stores/feedbackStore.js';

// Server-rendered pages. Styles live in one same-origin stylesheet so the CSP
// can stay `default-src 'self'` with no inline exceptions.

export const FILTER_LABELS: Record<InboxFilter, string> = {
  pending: 'Sin responder',
  answered: 'Respondidos',
  archived: 'Archivados',
  errors: 'Errores',
};

export const KIND_LABELS: Record<FeedbackKind, string> = { suggestion: 'Sugerencia', bug: 'Error', question: 'Consulta' };

const STATUS_LABELS: Record<ThreadStatus, string> = { open: 'Sin responder', answered: 'Respondido', archived: 'Archivado' };

const AR_TIME = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
});

export function formatArDate(iso: string): string {
  return AR_TIME.format(new Date(iso));
}

function stationLabel(id: string | null): string {
  if (!id) return 'Sin estación';
  return getStationById(id)?.name ?? id;
}

export const ADMIN_CSS = `
:root{font-family:system-ui,sans-serif}
body{margin:0;background:#F5F0E8;color:#4A3A2A}
header{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#3A6070;color:#F5F0E8}
header a{color:#F5F0E8;text-decoration:none;font-weight:700}
main{max-width:760px;margin:0 auto;padding:16px}
.narrow{max-width:360px}
.tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
.tab{padding:6px 12px;border-radius:999px;background:#E8DCC8;color:#4A3A2A;text-decoration:none}
.tab.active{background:#4A7C8A;color:#fff}
.inbox,.thread{list-style:none;padding:0;margin:0}
.inbox li a{display:block;padding:12px;margin-bottom:8px;background:#fff;border-radius:12px;color:inherit;text-decoration:none}
.kind{font-weight:700}.station,time{color:#8B7B6B;font-size:13px}
.meta{display:grid;grid-template-columns:auto 1fr;gap:4px 12px}
.msg{padding:10px 12px;border-radius:12px;margin:8px 0;max-width:85%}
.msg p{white-space:pre-wrap;margin:0 0 4px}
.msg.device{background:#fff}.msg.admin{background:#E6F0F3;margin-left:auto}
label{display:block;margin:12px 0}
textarea,input[type=password]{width:100%;box-sizing:border-box;font:inherit;padding:8px}
button{padding:8px 16px;border:0;border-radius:8px;background:#4A7C8A;color:#fff;font:inherit;cursor:pointer}
button.secondary{background:#8B7B6B;margin-top:8px}
button.link{background:none;color:inherit;text-decoration:underline;padding:0}
.error{color:#C53030}
`;

function documentOf(title: string, body: SafeHtml): string {
  return '<!doctype html>' + html`<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} · Paraná Info</title><link rel="stylesheet" href="/admin/assets/admin.css"></head><body>${body}</body></html>`.value;
}

function header(csrf: string): SafeHtml {
  return html`<header><a href="/admin">Paraná Info · Mensajes</a><form method="post" action="/admin/logout"><input type="hidden" name="_csrf" value="${csrf}"><button type="submit" class="link">Salir</button></form></header>`;
}

export function loginPage(o: { csrf: string; message?: string }): string {
  return documentOf('Ingresar', html`<main class="narrow">
<h1>Paraná Info · Admin</h1>
${o.message ? html`<p class="error">${o.message}</p>` : null}
<form method="post" action="/admin/login">
<input type="hidden" name="_csrf" value="${o.csrf}">
<label>Contraseña <input type="password" name="password" autocomplete="current-password" required></label>
<button type="submit">Ingresar</button>
</form>
</main>`);
}

export function inboxPage(o: { filter: InboxFilter; rows: InboxRow[]; csrf: string }): string {
  const tabs = (Object.keys(FILTER_LABELS) as InboxFilter[]).map(
    (f) => html`<a href="/admin?filter=${f}" class="${f === o.filter ? 'tab active' : 'tab'}">${FILTER_LABELS[f]}</a>`,
  );
  const list = o.rows.length === 0
    ? html`<p>No hay mensajes acá.</p>`
    : html`<ul class="inbox">${o.rows.map((r) => html`<li><a href="/admin/threads/${r.id}"><span class="kind">${KIND_LABELS[r.kind]}</span> <span class="station">${stationLabel(r.stationId)}</span> <time>${formatArDate(r.updatedAt)}</time><p>${r.preview}</p></a></li>`)}</ul>`;
  return documentOf('Mensajes', html`${header(o.csrf)}<main><nav class="tabs">${tabs}</nav>${list}</main>`);
}

export function threadPage(o: { thread: AdminThreadDetail; csrf: string; message?: string }): string {
  const t = o.thread;
  const bubbles = t.messages.map(
    (m) => html`<li class="${m.author === 'admin' ? 'msg admin' : 'msg device'}"><p>${m.body}</p><time>${m.author === 'admin' ? 'Paraná Info' : 'Usuario'} · ${formatArDate(m.createdAt)}</time></li>`,
  );
  return documentOf('Conversación', html`${header(o.csrf)}<main>
<p><a href="/admin">← Volver</a></p>
<dl class="meta">
<dt>Tipo</dt><dd>${KIND_LABELS[t.kind]}</dd>
<dt>Estado</dt><dd>${STATUS_LABELS[t.status]}</dd>
<dt>Estación</dt><dd>${stationLabel(t.stationId)}</dd>
<dt>Dispositivo</dt><dd>${t.shortDevice} (${t.deviceThreadCount} conversaciones)</dd>
<dt>App</dt><dd>${t.appVersion}</dd>
<dt>Sistema</dt><dd>${t.osVersion}</dd>
</dl>
<ol class="thread">${bubbles}</ol>
${o.message ? html`<p class="error">${o.message}</p>` : null}
<form method="post" action="/admin/threads/${t.id}/reply">
<input type="hidden" name="_csrf" value="${o.csrf}">
<label>Respuesta <textarea name="body" rows="5" required></textarea></label>
<button type="submit">Responder</button>
</form>
${t.status === 'archived' ? null : html`<form method="post" action="/admin/threads/${t.id}/archive"><input type="hidden" name="_csrf" value="${o.csrf}"><button type="submit" class="secondary">Archivar sin responder</button></form>`}
</main>`);
}

export function notFoundPage(): string {
  return documentOf('No encontrado', html`<main class="narrow"><h1>404</h1><p>No encontrado.</p></main>`);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run test/admin/views.test.ts && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/admin/views.ts server/test/admin/views.test.ts
git commit -m "feat(admin): server-rendered login, inbox and thread pages"
```

---

### Task 18: Admin Fastify instance — auth, CSRF, uniform 404, headers, actions

**Files:**
- Modify: `server/package.json`, `server/package-lock.json` (`@fastify/cookie`, `@fastify/formbody`)
- Create: `server/src/admin/server.ts`, `server/test/helpers/admin.ts`
- Test: `server/test/admin/server.test.ts`

**Interfaces:** Consumes: Tasks 11, 14–17, `newMessageSchema`/`parseInput` (Task 9), `loggerOptions` (Task 2), `safeEqual` (`middleware/apiKey.ts`). Produces: `SESSION_COOKIE = 'admin_session'`, `LOGIN_CSRF_COOKIE = 'admin_login_csrf'`, `interface AdminServerOptions { pool: Pool; passwordHash: string; secureCookie?: boolean; clock?: () => number; pushFetch?: typeof fetch; logger?: LoggerConfig }`, `buildAdminServer(opts: AdminServerOptions): Promise<FastifyInstance>`.

- [ ] **Step 1: Write the failing test**

```ts
// server/test/helpers/admin.ts
import type { FastifyInstance } from 'fastify';

export const PASSWORD = 'correct horse battery staple';

type Cookies = { cookies: Array<{ name: string; value: string }> };

export const cookieHeader = (res: Cookies, only?: string) =>
  res.cookies
    .filter((c) => c.value !== '' && (!only || c.name === only))
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

export function csrfFrom(page: string): string {
  const m = /name="_csrf" value="([^"]+)"/.exec(page);
  if (!m) throw new Error('no csrf field on page');
  return m[1];
}

export function postForm(app: FastifyInstance, url: string, cookie: string, fields: Record<string, string>) {
  return app.inject({
    method: 'POST', url,
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
    payload: new URLSearchParams(fields).toString(),
  });
}

export async function login(app: FastifyInstance, password = PASSWORD) {
  const page = await app.inject({ method: 'GET', url: '/admin/login' });
  return postForm(app, '/admin/login', cookieHeader(page), { password, _csrf: csrfFrom(page.body) });
}

export async function session(app: FastifyInstance): Promise<{ cookie: string; csrf: string }> {
  const res = await login(app);
  if (res.statusCode !== 303) throw new Error(`login failed: ${res.statusCode}`);
  const cookie = cookieHeader(res, 'admin_session');
  const inbox = await app.inject({ method: 'GET', url: '/admin', headers: { cookie } });
  return { cookie, csrf: csrfFrom(inbox.body) };
}
```

```ts
// server/test/admin/server.test.ts
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import type { Pool } from 'pg';
import { memPool } from '../helpers/memPool.js';
import { A } from '../helpers/devices.js';
import { PASSWORD, cookieHeader, csrfFrom, login, postForm, session } from '../helpers/admin.js';
import { buildAdminServer } from '../../src/admin/server.js';
import { hashPassword } from '../../src/admin/password.js';
import { registerDevice } from '../../src/stores/deviceTokenStore.js';
import { savePushToken } from '../../src/stores/pushStore.js';
import { createThread } from '../../src/stores/feedbackStore.js';
import { getThreadForAdmin } from '../../src/stores/feedbackAdminStore.js';
import { listAudit } from '../../src/stores/adminAudit.js';

const PUSH = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const MIN = 60_000;
let passwordHash: string;
let pool: Pool;
let now: number;
let pushFetch: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  pool = await memPool();
  now = Date.parse('2026-10-13T12:00:00.000Z');
  pushFetch = vi.fn(async () => new Response(JSON.stringify({ data: [{ status: 'ok' }] }), { status: 200 }));
  await registerDevice(pool, A, 'h');
});

const admin = (over: Partial<Parameters<typeof buildAdminServer>[0]> = {}) =>
  buildAdminServer({ pool, passwordHash, clock: () => now, pushFetch: pushFetch as unknown as typeof fetch, ...over });

const newThread = (body = '¿Hay datos de Goya?') =>
  createThread(pool, { deviceId: A, kind: 'question', body, stationId: 'goya', appVersion: '2.2.0', osVersion: 'android 34' }, new Date(now));

describe('login', () => {
  it('serves the login page with a CSRF cookie scoped to /admin', async () => {
    const a = await admin();
    const res = await a.inject({ method: 'GET', url: '/admin/login' });

    expect(res.statusCode).toBe(200);
    expect(csrfFrom(res.body)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const c = res.cookies.find((x) => x.name === 'admin_login_csrf');
    expect(c).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/admin' });
    await a.close();
  });

  it('signs in with the right password and sets a strict session cookie', async () => {
    const a = await admin();
    const res = await login(a);

    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toBe('/admin');
    const c = res.cookies.find((x) => x.name === 'admin_session');
    expect(c).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/admin', maxAge: 43200 });
    expect(c?.secure).toBeFalsy();
    expect((await listAudit(pool)).map((e) => e.action)).toEqual(['login']);
    await a.close();
  });

  it('adds Secure when served over HTTPS', async () => {
    const a = await admin({ secureCookie: true });
    const res = await login(a);
    expect(res.cookies.find((x) => x.name === 'admin_session')?.secure).toBe(true);
    await a.close();
  });

  it('refuses a wrong password and audits it', async () => {
    const a = await admin();
    const res = await login(a, 'wrong');

    expect(res.statusCode).toBe(401);
    expect(res.body).toContain('Contraseña incorrecta.');
    expect(res.cookies.find((x) => x.name === 'admin_session')).toBeUndefined();
    expect((await listAudit(pool)).map((e) => e.action)).toEqual(['login_failed']);
    await a.close();
  });

  it('locks the account for 15 minutes after 5 failures, even for the right password', async () => {
    const a = await admin();
    for (let i = 0; i < 5; i++) expect((await login(a, 'wrong')).statusCode).toBe(401);

    const locked = await login(a);
    expect(locked.statusCode).toBe(429);
    expect(locked.body).toContain('Demasiados intentos');
    expect(locked.cookies.find((x) => x.name === 'admin_session')).toBeUndefined();

    now += 15 * MIN;
    expect((await login(a)).statusCode).toBe(303);
    await a.close();
  });

  it('answers 404 to a login without its CSRF token', async () => {
    const a = await admin();
    const page = await a.inject({ method: 'GET', url: '/admin/login' });

    const res = await postForm(a, '/admin/login', cookieHeader(page), { password: PASSWORD, _csrf: 'forged' });

    expect(res.statusCode).toBe(404);
    expect(res.cookies.find((x) => x.name === 'admin_session')).toBeUndefined();
    await a.close();
  });
});

describe('sessions', () => {
  it('expires after 12 hours', async () => {
    const a = await admin();
    const { cookie } = await session(a);
    now += 12 * 3600_000;
    expect((await a.inject({ method: 'GET', url: '/admin', headers: { cookie } })).statusCode).toBe(404);
    await a.close();
  });

  it('ends on logout', async () => {
    const a = await admin();
    const { cookie, csrf } = await session(a);

    const out = await postForm(a, '/admin/logout', cookie, { _csrf: csrf });

    expect(out.statusCode).toBe(303);
    expect((await a.inject({ method: 'GET', url: '/admin', headers: { cookie } })).statusCode).toBe(404);
    await a.close();
  });
});

describe('uniform 404', () => {
  it('gives unknown, unauthorised and malformed paths the same answer', async () => {
    const a = await admin();
    const t = await newThread();
    const { cookie } = await session(a);

    const responses = await Promise.all([
      a.inject({ method: 'GET', url: '/admin' }),
      a.inject({ method: 'GET', url: `/admin/threads/${t.id}` }),
      a.inject({ method: 'GET', url: '/admin/nope', headers: { cookie } }),
      a.inject({ method: 'GET', url: '/admin/threads/not-a-uuid', headers: { cookie } }),
      a.inject({ method: 'GET', url: '/admin/threads/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', headers: { cookie } }),
      a.inject({ method: 'GET', url: '/' }),
    ]);

    for (const r of responses) {
      expect(r.statusCode).toBe(404);
      expect(r.body).toBe(responses[0].body);
    }
    await a.close();
  });
});

describe('headers', () => {
  it.each(['/admin/login', '/admin/nope'])('sets the security headers on %s', async (url) => {
    const a = await admin();
    const res = await a.inject({ method: 'GET', url });
    expect(res.headers['content-security-policy']).toBe("default-src 'self'");
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    await a.close();
  });
});

describe('inbox and thread', () => {
  it('lists pending threads and shows one', async () => {
    const a = await admin();
    const t = await newThread();
    const { cookie } = await session(a);

    const inbox = await a.inject({ method: 'GET', url: '/admin?filter=pending', headers: { cookie } });
    const detail = await a.inject({ method: 'GET', url: `/admin/threads/${t.id}`, headers: { cookie } });

    expect(inbox.body).toContain(`/admin/threads/${t.id}`);
    expect(detail.statusCode).toBe(200);
    expect(detail.body).toContain('¿Hay datos de Goya?');
    await a.close();
  });

  it('renders a stored script tag as text', async () => {
    const a = await admin();
    const t = await newThread('<script>alert(document.cookie)</script>');
    const { cookie } = await session(a);

    const inbox = await a.inject({ method: 'GET', url: '/admin', headers: { cookie } });
    const detail = await a.inject({ method: 'GET', url: `/admin/threads/${t.id}`, headers: { cookie } });

    for (const page of [inbox.body, detail.body]) {
      expect(page).not.toContain('<script>alert');
      expect(page).toContain('&lt;script&gt;alert(document.cookie)&lt;/script&gt;');
    }
    await a.close();
  });
});

describe('reply', () => {
  it('stores the reply, answers the thread, audits it and pushes without the text', async () => {
    await savePushToken(pool, A, PUSH);
    const a = await admin();
    const t = await newThread();
    const { cookie, csrf } = await session(a);

    const res = await postForm(a, `/admin/threads/${t.id}/reply`, cookie, { _csrf: csrf, body: 'Sí, desde mañana' });

    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toBe(`/admin/threads/${t.id}`);
    const detail = await getThreadForAdmin(pool, t.id);
    expect(detail?.status).toBe('answered');
    expect(detail?.messages.at(-1)).toMatchObject({ author: 'admin', body: 'Sí, desde mañana' });
    expect((await listAudit(pool)).map((e) => e.action)).toEqual(['login', 'reply']);
    expect(pushFetch).toHaveBeenCalledTimes(1);
    expect(String(pushFetch.mock.calls[0][1].body)).not.toContain('desde mañana');
    await a.close();
  });

  it('refuses a reply without the session CSRF token', async () => {
    const a = await admin();
    const t = await newThread();
    const { cookie } = await session(a);

    const res = await postForm(a, `/admin/threads/${t.id}/reply`, cookie, { body: 'sin token' });

    expect(res.statusCode).toBe(404);
    expect((await getThreadForAdmin(pool, t.id))?.messages).toHaveLength(1);
    await a.close();
  });

  it('a reply to a device without a push token still lands', async () => {
    const a = await admin();
    const t = await newThread();
    const { cookie, csrf } = await session(a);

    const res = await postForm(a, `/admin/threads/${t.id}/reply`, cookie, { _csrf: csrf, body: 'Respuesta' });

    expect(res.statusCode).toBe(303);
    expect((await getThreadForAdmin(pool, t.id))?.messages).toHaveLength(2);
    expect(pushFetch).not.toHaveBeenCalled();
    await a.close();
  });

  it('a reply still lands when Expo is unreachable', async () => {
    await savePushToken(pool, A, PUSH);
    const offline = vi.fn(async () => { throw new Error('ECONNRESET'); });
    const a = await admin({ pushFetch: offline as unknown as typeof fetch });
    const t = await newThread();
    const { cookie, csrf } = await session(a);

    const res = await postForm(a, `/admin/threads/${t.id}/reply`, cookie, { _csrf: csrf, body: 'Respuesta' });

    expect(res.statusCode).toBe(303);
    expect((await getThreadForAdmin(pool, t.id))?.messages).toHaveLength(2);
    await a.close();
  });

  it('a double-submitted reply stores one message and sends one push', async () => {
    await savePushToken(pool, A, PUSH);
    const a = await admin();
    const t = await newThread();
    const { cookie, csrf } = await session(a);

    await postForm(a, `/admin/threads/${t.id}/reply`, cookie, { _csrf: csrf, body: 'Una vez' });
    const second = await postForm(a, `/admin/threads/${t.id}/reply`, cookie, { _csrf: csrf, body: 'Una vez' });

    expect(second.statusCode).toBe(303);
    expect((await getThreadForAdmin(pool, t.id))?.messages).toHaveLength(2);
    expect(pushFetch).toHaveBeenCalledTimes(1);
    await a.close();
  });

  it('re-renders the thread with a message for an empty reply', async () => {
    const a = await admin();
    const t = await newThread();
    const { cookie, csrf } = await session(a);

    const res = await postForm(a, `/admin/threads/${t.id}/reply`, cookie, { _csrf: csrf, body: '   ' });

    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('La respuesta no puede estar vacía ni superar 2000 caracteres.');
    expect((await getThreadForAdmin(pool, t.id))?.messages).toHaveLength(1);
    await a.close();
  });
});

describe('archive', () => {
  it('archives without replying and audits it', async () => {
    const a = await admin();
    const t = await newThread();
    const { cookie, csrf } = await session(a);

    const res = await postForm(a, `/admin/threads/${t.id}/archive`, cookie, { _csrf: csrf });

    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toBe('/admin');
    expect((await getThreadForAdmin(pool, t.id))?.status).toBe('archived');
    expect((await listAudit(pool)).map((e) => e.action)).toEqual(['login', 'archive']);
    expect(pushFetch).not.toHaveBeenCalled();
    await a.close();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/admin/server.test.ts`
Expected: FAIL — `Cannot find module '../../src/admin/server.js'`.

- [ ] **Step 3: Minimal implementation**

```bash
npm install @fastify/cookie@^11.0.2 @fastify/formbody@^8.0.2
```

```ts
// server/src/admin/server.ts
import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { safeEqual } from '../middleware/apiKey.js';
import { loggerOptions, type LoggerConfig } from '../logging.js';
import { BODY_LIMIT } from '../server.js';
import { createSessionStore, SESSION_TTL_MS, type AdminSession } from './sessions.js';
import { createLockout } from './lockout.js';
import { verifyPassword } from './password.js';
import { ADMIN_CSS, inboxPage, loginPage, notFoundPage, threadPage } from './views.js';
import { newMessageSchema, parseInput } from '../feedback/validation.js';
import { recordAudit } from '../stores/adminAudit.js';
import { archiveThread, getThreadForAdmin, INBOX_FILTERS, listInbox, replyAsAdmin, type InboxFilter } from '../stores/feedbackAdminStore.js';
import { notifyReply } from '../services/replyPush.js';

// The owner's admin: a second Fastify instance in the same process, on its own
// port, published by Docker only on the tailnet address. Nothing here is
// registered on the public instance.

export const SESSION_COOKIE = 'admin_session';
export const LOGIN_CSRF_COOKIE = 'admin_login_csrf';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLIC_PATHS = new Set(['/admin/login', '/admin/assets/admin.css']);

export interface AdminServerOptions {
  pool: Pool;
  passwordHash: string;
  /** True only when served over HTTPS (Traefik fallback). */
  secureCookie?: boolean;
  clock?: () => number;
  pushFetch?: typeof fetch;
  logger?: LoggerConfig;
}

declare module 'fastify' {
  interface FastifyRequest {
    adminSession: AdminSession | null;
  }
}

const randomToken = () => randomBytes(32).toString('base64url');

function formField(req: FastifyRequest, name: string): string | undefined {
  const value = (req.body as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' ? value : undefined;
}

function csrfMatches(req: FastifyRequest, expected: string): boolean {
  const got = formField(req, '_csrf');
  return got !== undefined && safeEqual(got, expected);
}

export async function buildAdminServer(opts: AdminServerOptions): Promise<FastifyInstance> {
  const clock = opts.clock ?? Date.now;
  const now = () => new Date(clock());
  const sessions = createSessionStore({ now: clock });
  const lockout = createLockout({ now: clock });

  const app = Fastify({ logger: opts.logger ? loggerOptions(opts.logger) : false, bodyLimit: BODY_LIMIT });
  await app.register(cookie);
  await app.register(formbody);
  app.decorateRequest('adminSession', null);

  const cookieOptions = (maxAgeSeconds: number) => ({
    httpOnly: true,
    sameSite: 'strict' as const,
    path: '/admin',
    secure: opts.secureCookie ?? false,
    maxAge: maxAgeSeconds,
  });
  const page = (reply: FastifyReply, code: number, body: string) =>
    reply.code(code).type('text/html; charset=utf-8').send(body);
  // Unknown, unauthorised and forged requests are indistinguishable.
  const notFound = (reply: FastifyReply) => page(reply, 404, notFoundPage());

  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('Content-Security-Policy', "default-src 'self'");
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cache-Control', 'no-store');
    return payload;
  });

  app.addHook('preHandler', async (req, reply) => {
    if (PUBLIC_PATHS.has(req.url.split('?')[0])) return;
    const session = sessions.get(req.cookies[SESSION_COOKIE]);
    if (!session) return notFound(reply);
    if (req.method === 'POST' && !csrfMatches(req, session.csrf)) return notFound(reply);
    req.adminSession = session;
  });

  app.setNotFoundHandler((_req, reply) => notFound(reply));
  app.setErrorHandler((err, req, reply) => {
    if ((err.statusCode ?? 500) < 500) return notFound(reply);
    req.log.error({ err }, 'admin request failed');
    return reply.code(500).type('text/plain; charset=utf-8').send('Error interno');
  });

  app.get('/admin/assets/admin.css', async (_req, reply) =>
    reply.type('text/css; charset=utf-8').send(ADMIN_CSS));

  app.get('/admin/login', async (_req, reply) => {
    const csrf = randomToken();
    reply.setCookie(LOGIN_CSRF_COOKIE, csrf, cookieOptions(3600));
    return page(reply, 200, loginPage({ csrf }));
  });

  app.post('/admin/login', async (req, reply) => {
    const expected = req.cookies[LOGIN_CSRF_COOKIE];
    if (!expected || !csrfMatches(req, expected)) return notFound(reply);
    const at = now();

    const retry = (code: number, message: string) => {
      const csrf = randomToken();
      reply.setCookie(LOGIN_CSRF_COOKIE, csrf, cookieOptions(3600));
      return page(reply, code, loginPage({ csrf, message }));
    };

    if (lockout.isLocked()) {
      await recordAudit(opts.pool, 'login_failed', null, at);
      return retry(429, 'Demasiados intentos. Probá de nuevo en 15 minutos.');
    }
    if (!(await verifyPassword(opts.passwordHash, formField(req, 'password') ?? ''))) {
      lockout.recordFailure();
      await recordAudit(opts.pool, 'login_failed', null, at);
      return retry(401, 'Contraseña incorrecta.');
    }

    lockout.recordSuccess();
    const session = sessions.create();
    await recordAudit(opts.pool, 'login', null, at);
    reply.clearCookie(LOGIN_CSRF_COOKIE, { path: '/admin' });
    reply.setCookie(SESSION_COOKIE, session.id, cookieOptions(SESSION_TTL_MS / 1000));
    return reply.redirect('/admin', 303);
  });

  app.post('/admin/logout', async (req, reply) => {
    sessions.destroy(req.adminSession!.id);
    reply.clearCookie(SESSION_COOKIE, { path: '/admin' });
    return reply.redirect('/admin/login', 303);
  });

  app.get('/admin', async (req, reply) => {
    const requested = (req.query as { filter?: string }).filter;
    const filter: InboxFilter = INBOX_FILTERS.includes(requested as InboxFilter) ? (requested as InboxFilter) : 'pending';
    const rows = await listInbox(opts.pool, filter);
    return page(reply, 200, inboxPage({ filter, rows, csrf: req.adminSession!.csrf }));
  });

  app.get('/admin/threads/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!UUID.test(id)) return notFound(reply);
    const thread = await getThreadForAdmin(opts.pool, id);
    if (!thread) return notFound(reply);
    return page(reply, 200, threadPage({ thread, csrf: req.adminSession!.csrf }));
  });

  app.post('/admin/threads/:id/reply', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!UUID.test(id)) return notFound(reply);

    const parsed = parseInput(newMessageSchema, { body: formField(req, 'body') });
    if (!parsed.ok) {
      const thread = await getThreadForAdmin(opts.pool, id);
      if (!thread) return notFound(reply);
      return page(reply, 400, threadPage({
        thread, csrf: req.adminSession!.csrf,
        message: 'La respuesta no puede estar vacía ni superar 2000 caracteres.',
      }));
    }

    const result = await replyAsAdmin(opts.pool, id, parsed.data.body, now());
    if (result === 'not_found') return notFound(reply);
    if (result === 'sent') {
      // The reply is already stored; a push failure must not undo or hide it.
      try {
        const outcome = await notifyReply(opts.pool, id, { fetchFn: opts.pushFetch, now: now() });
        req.log.info({ threadId: id, outcome }, 'reply push');
      } catch (err) {
        req.log.warn({ err, threadId: id }, 'reply push failed');
      }
    }
    return reply.redirect(`/admin/threads/${id}`, 303);
  });

  app.post('/admin/threads/:id/archive', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!UUID.test(id)) return notFound(reply);
    if (!(await archiveThread(opts.pool, id, now()))) return notFound(reply);
    return reply.redirect('/admin', 303);
  });

  return app;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run && npm run build && npm audit --omit=dev --audit-level=high`
Expected: all pass; audit exits 0.

- [ ] **Step 5: MUTATION-CHECK the CSRF validation**

```bash
cp src/admin/server.ts /tmp/adminServer.ts.bak
sd -F "if (req.method === 'POST' && !csrfMatches(req, session.csrf)) return notFound(reply);" "" src/admin/server.ts
npx vitest run test/admin/server.test.ts -t "refuses a reply without the session CSRF token"
```
Expected: FAIL — `expected 303 to be 404`. Restore:

```bash
cp /tmp/adminServer.ts.bak src/admin/server.ts
```

- [ ] **Step 6: MUTATION-CHECK the escaping end to end**

```bash
cp src/admin/html.ts /tmp/html.ts.bak
sd -F 'return escapeHtml(String(v));' 'return String(v);' src/admin/html.ts
npx vitest run test/admin/server.test.ts -t "renders a stored script tag as text"
```
Expected: FAIL — the page contains `<script>alert(document.cookie)</script>`. Restore and run everything:

```bash
cp /tmp/html.ts.bak src/admin/html.ts
npx vitest run
```
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add server/package.json server/package-lock.json server/src/admin/server.ts server/test/helpers/admin.ts server/test/admin/server.test.ts
git commit -m "feat(admin): tailnet admin instance with sessions, CSRF, lockout, uniform 404 and reply push"
```

---

### Task 19: Run the admin on `ADMIN_PORT`, keep it off the public instance, document the tailnet exposure

**Files:**
- Modify: `server/src/config/env.ts`, `server/src/index.ts`, `server/Dockerfile:18`, `server/DEPLOY-COOLIFY.md` (append section 10)
- Test: `server/test/adminIsolation.test.ts` (create), `server/test/env.test.ts` (append)

**Interfaces:** Consumes: `buildAdminServer` (Task 18), `buildServer`. Produces: `Env.adminPasswordHash: string | null`, `Env.adminPort: number` (default 3100), `Env.adminSecureCookie: boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// server/test/adminIsolation.test.ts
import { describe, it, expect } from 'vitest';
import { buildServer } from '../src/server.js';
import { buildAdminServer } from '../src/admin/server.js';
import { memPool } from './helpers/memPool.js';
import { H, KEY } from './helpers/devices.js';

describe('admin isolation', () => {
  it('the public instance does not serve the admin, with or without the key', async () => {
    const app = await buildServer({ pool: await memPool(), apiKey: KEY });

    const withKey = await app.inject({ method: 'GET', url: '/admin/login', headers: H });
    const without = await app.inject({ method: 'GET', url: '/admin/login' });

    expect(withKey.statusCode).toBe(404);
    expect(without.statusCode).toBe(401);
    await app.close();
  });

  it('the admin instance does not serve the public API', async () => {
    const admin = await buildAdminServer({ pool: await memPool(), passwordHash: '$argon2id$x' });

    for (const url of ['/health', '/news', '/public/river']) {
      expect((await admin.inject({ method: 'GET', url })).statusCode).toBe(404);
    }
    expect((await admin.inject({ method: 'POST', url: '/devices/register', payload: {} })).statusCode).toBe(404);
    await admin.close();
  });
});
```

Append to `server/test/env.test.ts`:

```ts
  it('defaults the admin to port 3100, plain cookies, and disabled without a hash', () => {
    expect(loadEnv({ DATABASE_URL: 'x', APP_API_KEY: 'k' })).toMatchObject({
      adminPasswordHash: null, adminPort: 3100, adminSecureCookie: false,
    });
  });

  it('disables the admin rather than crashing when the hash is not argon2id', () => {
    // Docker compose interpolation can eat the `$` segments of a hash pasted
    // without "Is Literal"; the API must still boot.
    expect(loadEnv({ DATABASE_URL: 'x', APP_API_KEY: 'k', ADMIN_PASSWORD_HASH: 'argon2id=19' }).adminPasswordHash).toBeNull();
    expect(loadEnv({ DATABASE_URL: 'x', APP_API_KEY: 'k', ADMIN_PASSWORD_HASH: '$argon2id$v=19$m=19456,t=2,p=1$abc$def' }).adminPasswordHash)
      .toBe('$argon2id$v=19$m=19456,t=2,p=1$abc$def');
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/adminIsolation.test.ts test/env.test.ts`
Expected: isolation PASSES already (it guards a property, not new code — keep it as a regression test); env tests FAIL (`adminPort` undefined).

- [ ] **Step 3: Minimal implementation**

`server/src/config/env.ts` — schema:

```ts
  ADMIN_PASSWORD_HASH: z.string().optional(),
  ADMIN_PORT: z.string().regex(/^\d+$/).optional(),
  ADMIN_SECURE_COOKIE: z.enum(['true', 'false']).optional(),
```

`Env`:

```ts
  /** Null disables the admin listener; a malformed value is treated as missing. */
  adminPasswordHash: string | null;
  adminPort: number;
  adminSecureCookie: boolean;
```

return:

```ts
    adminPasswordHash: parsed.ADMIN_PASSWORD_HASH?.startsWith('$argon2id$') ? parsed.ADMIN_PASSWORD_HASH : null,
    adminPort: parsed.ADMIN_PORT ? Number(parsed.ADMIN_PORT) : 3100,
    adminSecureCookie: parsed.ADMIN_SECURE_COOKIE === 'true',
```

`server/src/index.ts` — add the import `import { buildAdminServer } from './admin/server.js';` and, at the end of `main()`:

```ts
  if (env.adminPasswordHash) {
    const admin = await buildAdminServer({
      pool,
      passwordHash: env.adminPasswordHash,
      secureCookie: env.adminSecureCookie,
      logger: { level: env.logLevel },
    });
    // 0.0.0.0 inside the container; who can reach it is decided by the Docker
    // port mapping, which binds only the tailnet address (DEPLOY-COOLIFY.md §10).
    await admin.listen({ port: env.adminPort, host: '0.0.0.0' });
    console.log(`[admin] listening on ${env.adminPort} (tailnet only)`);
  } else {
    console.log('[admin] ADMIN_PASSWORD_HASH missing or not argon2id: admin disabled');
  }
```

`server/Dockerfile` — replace `EXPOSE 3000` with:

```dockerfile
# 3000 public API (Traefik); 3100 owner admin, published on the tailnet IP only
EXPOSE 3000 3100
```

Append to `server/DEPLOY-COOLIFY.md`:

````markdown
## 10. Feedback: owner email and the tailnet-only admin

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
| `LEGACY_DEVICE_ROUTES` | `on` | `off` once `/stats` → `auth.shareOfActive` ≥ 0.9 |

Generate the hash on your machine (the password is read from stdin, never from argv):

```bash
cd server && read -rs PW && printf '%s\n' "$PW" | npx tsx src/admin/hashPassword.ts; unset PW
```

### Resend domain (Cloudflare DNS)

1. Resend → Domains → Add `rioparana.com.ar`, region `us-east-1`.
2. Cloudflare → DNS for `rioparana.com.ar`: add exactly the records Resend shows — a TXT `resend._domainkey` (DKIM), an MX `send` → `feedback-smtp.us-east-1.amazonses.com` (priority 10) and a TXT `send` → `v=spf1 include:amazonses.com ~all` (SPF). Set every record to **DNS only** (grey cloud).
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

If `rolsuper` is true (Coolify's default `postgres` user), no grant restricts it. Create an app role once, as the superuser, then point `DATABASE_URL` at it:

```sql
CREATE ROLE rioparana_app LOGIN PASSWORD '<random>';
GRANT CONNECT ON DATABASE postgres TO rioparana_app;
GRANT USAGE, CREATE ON SCHEMA public TO rioparana_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rioparana_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rioparana_app;
REVOKE UPDATE, DELETE, TRUNCATE ON admin_audit FROM rioparana_app;
```

Verify as `rioparana_app`: `UPDATE admin_audit SET action = 'x';` → `permission denied for table admin_audit`. (`runMigrations` only runs `IF NOT EXISTS` DDL on tables the superuser already created, so it keeps working under the new role.)
````

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run && npm run build && docker build -t rp-server-test . && docker run --rm rp-server-test node -e "import('@node-rs/argon2').then(m => m.hash('x')).then(h => console.log(h.slice(0, 10)))"`
Expected: all tests pass; image builds; the container prints `$argon2id$` (native binary present on node:20-slim).

- [ ] **Step 5: Commit**

```bash
git add server/src/config/env.ts server/src/index.ts server/Dockerfile server/DEPLOY-COOLIFY.md server/test/adminIsolation.test.ts server/test/env.test.ts
git commit -m "feat(server): start the admin on ADMIN_PORT and document tailnet-only exposure"
```

> **Phase 2 boundary.** Deployable. Verify the checklist above before Rollout step 3 (the app release).

---

## Rollout

Every deploy below is a **gated step**: ask the owner for an explicit OK first, quoting what will change. Never deploy on your own initiative.

1. **Phase 0 deploy (Tasks 1–6).** After OK: `git push origin main`, then `~/.hermes/scripts/deploy-coolify.sh t7uqevsj5bex092bqtxqdx86 --watch`. Verify:
   - `curl -s https://api.rioparana.com.ar/health` → `{"status":"ok"}`
   - `curl -s -XPOST https://api.rioparana.com.ar/devices/register -H "x-api-key: $APP_API_KEY" -H 'Content-Type: application/json' -d "{\"deviceId\":\"$(uuidgen | tr A-Z a-z)\"}"` → `{"token":"…"}` (43 chars)
   - Legacy still works: `curl -s -o /dev/null -w '%{http_code}' -XPOST https://api.rioparana.com.ar/devices/ping -H "x-api-key: $APP_API_KEY" -H 'Content-Type: application/json' -d '{"deviceId":"11111111-1111-4111-8111-111111111111"}'` → `204`
   - Coolify logs show JSON pino lines and no `authorization`/`x-api-key` values.
2. **Phase 1 + 2 deploy (Tasks 7–19).** Before OK: Resend domain verified and the env table from DEPLOY-COOLIFY.md §10 filled in (hash marked Is Literal), port mapping `100.89.213.31:3100:3100` set, audit role decision made. After OK: push and deploy as above. Verify the §10 checklist line by line, then an end-to-end smoke from your machine: register a token, `POST /feedback` with it, wait ≤ 20 minutes for the email, open the link over the tailnet, reply, check `GET /feedback/:id` shows the reply.
3. **App 2.2.0** — see `docs/superpowers/plans/2026-10-13-feedback-app.md`. Only after step 2 is verified.
4. **Sunset legacy routes.** Watch `GET /stats` → `auth.shareOfActive`. When it is ≥ 0.9 for 7 consecutive days, ask the owner for OK, set `LEGACY_DEVICE_ROUTES=off` in Coolify and redeploy. Verify the three legacy routes answer 410.

## Spec Coverage

| Spec section | Tasks |
|---|---|
| Phase 0 — per-device token, TOFU, `/me/*`, transition | 3, 4, 5, 6 |
| Phase 0 — logging and errors | 2 |
| Phase 0 — Fastify 5, audit, rate limits, bodyLimit | 1, 2, 4, 5 |
| Phase 1 — data model | 3, 7 |
| Phase 1 — device routes, 404 not 403, limits, station check | 8, 9, 10 |
| Phase 1 — owner email (5-min tick, 15-min debounce, retry, missing key) | 12, 13 |
| Phase 1 — reply push | 11, 18 |
| Phase 2 — second instance, ADMIN_PORT, tailnet, ipAllowList fallback | 18, 19 |
| Phase 2 — escaping, auth, cookie, CSRF, lockout, uniform 404, headers | 14, 15, 17, 18 |
| Phase 2 — screens, filters, detail, reply/archive + audit | 16, 17, 18 |
| Phase 3 — retention purge job (server side) | 13 |
| Error handling summary | 2, 9, 10, 11, 12, 18 |
| Testing — mutation checks (ownership, CSRF, escaping, token resolution) | 4, 10, 14, 18 |
| Manual — admin unreachable off the tailnet | 19 checklist, Rollout 2 |
| Rollout | Rollout section |
