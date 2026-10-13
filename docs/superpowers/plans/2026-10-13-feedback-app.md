# In-app Feedback — App 2.2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship app 2.2.0: per-device token registration, device calls moved to `/me/*`, a "Contacto y sugerencias" screen with threads, three entry points, push-to-thread deep links, and the store compliance updates.
**Architecture:** A small token service registers the device once (`/devices/register`) and an `authedFetch` wrapper attaches `x-api-key` + `Authorization: Bearer`, re-registering once on `invalid_token`. A typed feedback client returns `{ ok, data } | { ok: false, reason }` and never throws; React Query hooks feed two expo-router screens under `app/contacto/`. Pure logic is tested with vitest, components with jest-expo, the whole loop with Maestro.
**Tech Stack:** Expo SDK 54, expo-router 6, React Native 0.81, @tanstack/react-query 5, expo-secure-store, expo-notifications, expo-constants, vitest 3 (`*.test.ts`), jest-expo + @testing-library/react-native (`*.test.tsx`), Maestro, EAS Build/Submit.
**Spec:** docs/superpowers/specs/2026-10-13-in-app-feedback-design.md
**Server contract:** "API Contract" section of `docs/superpowers/plans/2026-10-13-feedback-server.md` (must be deployed through its Rollout step 2 before this app is released).

## Global Constraints

- All commands run from the repo root `/Users/agustingarassino/workspace/agarassino-productos/rioparana-app` unless a step says otherwise.
- `*.test.ts` runs under vitest (`npm run test:logic`), `*.test.tsx` under jest-expo (`npm run test:components`); vitest cannot import `react-native`, so anything a vitest test imports must not import it (directly or transitively) — mock the module that would.
- Code, identifiers, comments and tests in English. User-facing Spanish copy exactly as listed in "Copy" below; spec strings verbatim.
- Conventional commits, one per task, no `Co-Authored-By` or AI attribution. Stage only the files the task lists.
- Nothing on app start may throw or block the UI: registration, ping and push-token calls are fire-and-forget and swallow errors.
- Message body rules mirror the server: trimmed, 1–2000 **code points** (`[...s].length`), no `\u0000`.
- The device token is kept only in SecureStore under `parana-info.device-token`; it is never logged or shown.
- On `401 { error: 'invalid_token' }` the app drops its token, registers again once and retries the request once; on `401 { error: 'unauthorized' }` (API key) it keeps the token. On `409 already_registered` it rotates the deviceId once.
- Push tap with `data.type === 'feedback_reply'` and a UUID `threadId` opens `/contacto/<threadId>`, cold start included, using the same root handler as the daily notification.
- Version 2.2.0; EAS `appVersionSource: remote` + `autoIncrement` — the EAS and Play versionCode counters can drift, check Play's last versionCode before building.
- Builds, store submissions and server deploys only with the owner's explicit OK.

### Copy (Spanish, exact)

| Where | Text |
|---|---|
| Screen title | `Contacto y sugerencias` |
| Kind chips | `Sugerencia`, `Error`, `Consulta` |
| Station chip | `Sobre: <nombre de la estación>` (remove button a11y label `Quitar estación`) |
| Text box placeholder | `Contanos qué viste o qué te gustaría que tenga la app` |
| Send button | `Enviar` (`Reintentar` after a failed send) |
| Privacy line | `Te respondemos acá. No hace falta mail ni datos personales.` |
| List heading | `Mis mensajes` |
| Status pills | open `Enviado`, answered `Respondido`, archived `Cerrado`; unread dot a11y label `Respuesta sin leer` |
| Thread title | `Conversación`; owner signature `Paraná Info`; own messages `Vos` |
| Thread reply placeholder | `Escribí tu mensaje` |
| Thread gone | `Esta conversación ya no está disponible.` |
| Failure: offline | `No pudimos enviar tu mensaje. Revisá tu conexión y probá de nuevo.` |
| Failure: limit | `Llegaste al límite de mensajes por hoy. Probá de nuevo mañana.` |
| Failure: invalid | `Revisá el mensaje: no puede estar vacío ni superar 2000 caracteres.` |
| Failure: unavailable | `El servicio no está disponible ahora. Probá de nuevo en un rato.` |
| Perfil row | `Contacto y sugerencias` |
| Station link | `¿Ves algo mal en este dato? Avisanos →` |
| Inicio card | `¿Una idea o un error? Escribinos: leemos todo y te respondemos acá en la app.` |

(The spec fixes the title, chips, station chip, privacy line, list heading, signature and the three entry-point texts; the rest is decided here — see "Spec gaps resolved" at the end.)

## Review Focus

1. **Offline or timed-out send** — the typed text stays in the box, the failure copy appears, the button becomes `Reintentar`, and nothing navigates. Tests: Task 6 "keeps the text and offers a retry when offline", Task 7 "keeps a failed reply in the box".
2. **Double tap on Enviar** — a second press while the first request is in flight sends nothing (a ref guard, not just `isPending`, because the re-render lags the second tap). Tests: Task 6 "sends once on a double tap", Task 7 "replies once on a double tap".
3. **Emoji and long text** — counter and `canSend` count code points: 2000 emoji are sendable and shown as `2000/2000`, 2001 are not; whitespace-only is not. Tests: Task 5 `feedbackText.test.ts`, Task 6 "counts emoji as one character".
4. **Token lifecycle edge cases** — `invalid_token` → clear, re-register, retry once (no loop); API-key `unauthorized` → token kept; `409` → rotate id once then give up; concurrent callers share one registration. Tests: Task 1 `deviceToken.test.ts`, Task 2 `authedFetch.test.ts`.
5. **Push deep link to a thread that is gone or malformed** — a purged/foreign thread shows `Esta conversación ya no está disponible.`; a non-UUID `threadId` or unknown `type` is ignored; the daily notification still routes to `/notificaciones`. Tests: Task 7 "says so when the thread is gone", Task 9 `notificationRoute.test.ts`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/services/api/http.ts` (create) | Base URL, API key, timeout helper shared by every client |
| `src/services/api/backend.ts` (modify) | Imports from `http.ts`; ping/push-token/notifications move to `/me/*` via `authedFetch` |
| `src/services/deviceId.ts` (modify) | Adds `rotateDeviceId()` |
| `src/services/deviceToken.ts` (create) | SecureStore-backed token; one shared registration; 409 rotation |
| `src/services/api/authedFetch.ts` (create) | Bearer + key on every device-scoped call; one re-register retry |
| `src/services/api/feedbackApi.ts` (create) | Typed feedback client and result union |
| `src/services/feedbackText.ts` (create) | Code-point counting, `canSend`, labels and failure copy |
| `src/services/deviceInfo.ts` (create) | `appVersion` / `osVersion` from expo-constants + Platform |
| `src/services/notificationRoute.ts` (create) | Push `data` → route (pure) |
| `src/hooks/useDeviceRegistration.ts` (create) | Register on mount and on return to foreground |
| `src/hooks/useFeedback.ts` (create) | React Query hooks for threads, thread, send, reply |
| `src/hooks/usePushRegistration.ts`, `useNotificationHistory.ts`, `useDevicePing.ts` (modify) | Drop `deviceId` arguments |
| `src/hooks/index.ts` (modify) | Export the new hooks |
| `src/components/feedback/KindChips.tsx` (create) | Three radio chips |
| `src/components/feedback/StatusPill.tsx` (create) | Status label + unread dot |
| `src/components/feedback/MessageBubble.tsx` (create) | One message, signed |
| `src/components/feedback/FeedbackHomeCard.tsx` (create) | Inicio entry card |
| `src/components/feedback/StationReportLink.tsx` (create) | Station-screen entry link |
| `app/contacto/index.tsx` (create) | Contact screen (mockup A) |
| `app/contacto/[threadId].tsx` (create) | Thread screen |
| `app/_layout.tsx` (modify) | Registration hook, route table, push routing, refresh on reply push |
| `app/(tabs)/profile.tsx`, `app/(tabs)/index.tsx`, `app/river/[stationId].tsx` (modify) | Entry points |
| `docs/privacy-policy.html`, `privacy-policy/index.html`, `landing/privacy-policy.html` (modify) | Messages, Resend, 12-month retention, deletion |
| `scripts/update-privacy-policy.mjs` (create) | Applies the policy edits identically to the three copies |
| `.maestro/feedback-send.yaml`, `.maestro/feedback-reply.yaml`, `scripts/e2e-admin-reply.mjs`, `scripts/e2e-feedback.sh` (create) | End-to-end loop |
| `app.json`, `package.json` (modify) | 2.2.0, `e2e:feedback` script |
| `test/*.test.ts`, `test/*.test.tsx` (create/modify) | One test file per module above |

---

### Task 1: Device token service

**Files:**
- Create: `src/services/api/http.ts`, `src/services/deviceToken.ts`
- Modify: `src/services/api/backend.ts:1-17` (constants and `withTimeout` move to `http.ts`), `src/services/deviceId.ts` (append `rotateDeviceId`)
- Test: `test/deviceToken.test.ts` (create), `test/deviceId.test.ts` (append)

**Interfaces:** Consumes: `POST /devices/register` (server contract). Produces: `API_BASE_URL`, `API_KEY`, `REQUEST_TIMEOUT_MS`, `withTimeout(ms): { signal: AbortSignal; clear(): void }` from `http.ts`; `rotateDeviceId(): Promise<string>`; `getStoredToken(): Promise<string | null>`, `ensureDeviceToken(): Promise<string | null>` (never throws; concurrent calls share one registration), `clearDeviceToken(): Promise<void>`.

- [ ] **Step 1: Write the failing test**

```ts
// test/deviceToken.test.ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (k: string) => store.get(k) ?? null),
  setItemAsync: vi.fn(async (k: string, v: string) => { store.set(k, v); }),
  deleteItemAsync: vi.fn(async (k: string) => { store.delete(k); }),
}));

const TOKEN = 'a'.repeat(43);
const TOKEN_KEY = 'parana-info.device-token';
const ID_KEY = 'parana-info.device-id';
const created = (token: string) => new Response(JSON.stringify({ token }), { status: 201 });
const taken = () => new Response(JSON.stringify({ error: 'already_registered' }), { status: 409 });
const sentId = (f: ReturnType<typeof vi.fn>, call: number) => JSON.parse(String(f.mock.calls[call][1].body)).deviceId;

async function load() {
  vi.resetModules();
  return import('../src/services/deviceToken');
}

beforeEach(() => store.clear());
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('ensureDeviceToken', () => {
  test('registers this device once and keeps the token in SecureStore', async () => {
    const fetchMock = vi.fn(async () => created(TOKEN));
    vi.stubGlobal('fetch', fetchMock);
    const { ensureDeviceToken } = await load();

    expect(await ensureDeviceToken()).toBe(TOKEN);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/devices\/register$/);
    expect(init.method).toBe('POST');
    expect(sentId(fetchMock, 0)).toBe(store.get(ID_KEY));
    expect(store.get(TOKEN_KEY)).toBe(TOKEN);
  });

  test('uses the stored token without touching the network', async () => {
    store.set(TOKEN_KEY, TOKEN);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { ensureDeviceToken } = await load();

    expect(await ensureDeviceToken()).toBe(TOKEN);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('shares one registration between concurrent callers', async () => {
    const fetchMock = vi.fn(async () => created(TOKEN));
    vi.stubGlobal('fetch', fetchMock);
    const { ensureDeviceToken } = await load();

    expect(await Promise.all([ensureDeviceToken(), ensureDeviceToken(), ensureDeviceToken()])).toEqual([TOKEN, TOKEN, TOKEN]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('starts over under a new device id when the server refuses the old one', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(taken()).mockResolvedValueOnce(created(TOKEN));
    vi.stubGlobal('fetch', fetchMock);
    const { ensureDeviceToken } = await load();

    expect(await ensureDeviceToken()).toBe(TOKEN);
    expect(sentId(fetchMock, 1)).not.toBe(sentId(fetchMock, 0));
    expect(store.get(ID_KEY)).toBe(sentId(fetchMock, 1));
  });

  test('gives up after a second refusal instead of looping', async () => {
    const fetchMock = vi.fn(async () => taken());
    vi.stubGlobal('fetch', fetchMock);
    const { ensureDeviceToken } = await load();

    expect(await ensureDeviceToken()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('returns null offline and tries again on the next call', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(created(TOKEN));
    vi.stubGlobal('fetch', fetchMock);
    const { ensureDeviceToken } = await load();

    expect(await ensureDeviceToken()).toBeNull();
    expect(await ensureDeviceToken()).toBe(TOKEN);
  });

  test('refuses a malformed token from the server', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => created('short')));
    const { ensureDeviceToken } = await load();
    expect(await ensureDeviceToken()).toBeNull();
    expect(store.has(TOKEN_KEY)).toBe(false);
  });
});

describe('clearDeviceToken', () => {
  test('forgets the token in memory and in SecureStore', async () => {
    store.set(TOKEN_KEY, TOKEN);
    const { clearDeviceToken, getStoredToken } = await load();
    expect(await getStoredToken()).toBe(TOKEN);

    await clearDeviceToken();

    expect(await getStoredToken()).toBeNull();
    expect(store.has(TOKEN_KEY)).toBe(false);
  });
});
```

Append to `test/deviceId.test.ts` (inside the file, after the existing `describe`):

```ts
describe('rotateDeviceId', () => {
  test('replaces the stored identifier with a fresh v4 one', async () => {
    const { getDeviceId, rotateDeviceId } = await load();
    const before = await getDeviceId();

    const after = await rotateDeviceId();

    expect(after).toMatch(UUID_V4);
    expect(after).not.toBe(before);
    expect(await getDeviceId()).toBe(after);
    expect(store.get('parana-info.device-id')).toBe(after);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/deviceToken.test.ts test/deviceId.test.ts`
Expected: FAIL — `Failed to load url ../src/services/deviceToken`; `rotateDeviceId is not a function`.

- [ ] **Step 3: Minimal implementation**

```ts
// src/services/api/http.ts
// Shared by every client of our backend. Release builds use the production
// API by default, while EXPO_PUBLIC_* variables allow environment overrides.
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || 'https://api.rioparana.com.ar';
export const API_KEY = process.env.EXPO_PUBLIC_APP_API_KEY || '';

export const REQUEST_TIMEOUT_MS = 5000;

export function withTimeout(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(id) };
}
```

In `src/services/api/backend.ts`, delete the `API_BASE_URL`, `API_KEY`, `REQUEST_TIMEOUT_MS` constants and the `withTimeout` function (lines 3–17) and add below the types import:

```ts
import { API_BASE_URL, API_KEY, REQUEST_TIMEOUT_MS, withTimeout } from './http';
```

Append to `src/services/deviceId.ts`:

```ts
/**
 * Replaces this device's identifier. Used only when the server will never
 * issue a token for the current one (it already has one this install lost).
 */
export async function rotateDeviceId(): Promise<string> {
  const id = newDeviceId();
  try {
    await SecureStore.setItemAsync(KEY, id);
  } catch {
    // Still usable for this session.
  }
  cached = id;
  return id;
}
```

```ts
// src/services/deviceToken.ts
import * as SecureStore from 'expo-secure-store';

import { getDeviceId, rotateDeviceId } from './deviceId';
import { API_BASE_URL, API_KEY, REQUEST_TIMEOUT_MS, withTimeout } from './api/http';

// This install's credential for device-scoped calls. The server hands it out
// once per deviceId and keeps only its hash, so losing it means starting over
// under a new id. Never throws: it runs on app start.

const KEY = 'parana-info.device-token';
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

let cached: string | null = null;
let inFlight: Promise<string | null> | null = null;

type Outcome = { token: string } | 'taken' | 'failed';

export async function getStoredToken(): Promise<string | null> {
  if (cached) return cached;
  try {
    const stored = await SecureStore.getItemAsync(KEY);
    if (stored && TOKEN_SHAPE.test(stored)) {
      cached = stored;
      return stored;
    }
  } catch {
    // Unreadable storage is the same as no token.
  }
  return null;
}

export async function clearDeviceToken(): Promise<void> {
  cached = null;
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // Nothing more to do.
  }
}

async function requestToken(deviceId: string): Promise<Outcome> {
  const timeout = withTimeout(REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE_URL}/devices/register`, {
      method: 'POST',
      headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId }),
      signal: timeout.signal,
    });
    if (res.status === 409) return 'taken';
    if (res.status !== 201) return 'failed';
    const body = (await res.json()) as { token?: unknown };
    return typeof body.token === 'string' && TOKEN_SHAPE.test(body.token) ? { token: body.token } : 'failed';
  } catch {
    return 'failed';
  } finally {
    timeout.clear();
  }
}

/** This device's token, registering first if there is none; null when that is not possible right now. */
export function ensureDeviceToken(): Promise<string | null> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const stored = await getStoredToken();
    if (stored) return stored;

    let outcome = await requestToken(await getDeviceId());
    // The id already holds a token this install does not have. The server
    // will never hand that one out again, so start over once under a new id.
    if (outcome === 'taken') outcome = await requestToken(await rotateDeviceId());
    if (typeof outcome !== 'object') return null;

    cached = outcome.token;
    try {
      await SecureStore.setItemAsync(KEY, outcome.token);
    } catch {
      // Usable for this session; the next launch will rotate and register again.
    }
    return outcome.token;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test:logic && npm run typecheck`
Expected: all vitest files pass; `tsc --noEmit` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/services/api/http.ts src/services/api/backend.ts src/services/deviceId.ts src/services/deviceToken.ts test/deviceToken.test.ts test/deviceId.test.ts
git commit -m "feat(app): register a per-device token once and keep it in SecureStore"
```

---

### Task 2: `authedFetch` for device-scoped calls

**Files:**
- Create: `src/services/api/authedFetch.ts`
- Test: `test/authedFetch.test.ts`

**Interfaces:** Consumes: `ensureDeviceToken`, `clearDeviceToken` (Task 1), `http.ts`. Produces: `authedFetch(path: string, init?: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown }): Promise<Response | null>` — null means "no token or no network"; never throws.

- [ ] **Step 1: Write the failing test**

```ts
// test/authedFetch.test.ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ ensure: vi.fn(), clear: vi.fn(async () => {}) }));
vi.mock('../src/services/deviceToken', () => ({
  ensureDeviceToken: mocks.ensure,
  clearDeviceToken: mocks.clear,
}));

import { authedFetch } from '../src/services/api/authedFetch';

const TOKEN = 'a'.repeat(43);
const TOKEN2 = 'b'.repeat(43);
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const headersOf = (f: ReturnType<typeof vi.fn>, call: number) =>
  (f.mock.calls[call][1] as RequestInit).headers as Record<string, string>;

beforeEach(() => { mocks.ensure.mockReset(); mocks.clear.mockClear(); });
afterEach(() => vi.unstubAllGlobals());

describe('authedFetch', () => {
  test('sends the api key, the bearer token and a JSON body', async () => {
    mocks.ensure.mockResolvedValue(TOKEN);
    const fetchMock = vi.fn(async () => json(201, {}));
    vi.stubGlobal('fetch', fetchMock);

    const res = await authedFetch('/feedback', { method: 'POST', body: { a: 1 } });

    expect(res?.status).toBe(201);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/feedback$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ a: 1 });
    expect(headersOf(fetchMock, 0)).toMatchObject({ Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' });
    expect(headersOf(fetchMock, 0)).toHaveProperty('x-api-key');
  });

  test('returns null without calling the API when there is no token', async () => {
    mocks.ensure.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await authedFetch('/me/ping', { method: 'POST', body: {} })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('returns null rather than throwing when offline', async () => {
    mocks.ensure.mockResolvedValue(TOKEN);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Network request failed'); }));

    expect(await authedFetch('/feedback')).toBeNull();
  });

  test('re-registers once and retries when the server no longer knows the token', async () => {
    mocks.ensure.mockResolvedValueOnce(TOKEN).mockResolvedValueOnce(TOKEN2);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(401, { error: 'invalid_token' }))
      .mockResolvedValueOnce(json(200, []));
    vi.stubGlobal('fetch', fetchMock);

    const res = await authedFetch('/feedback');

    expect(res?.status).toBe(200);
    expect(mocks.clear).toHaveBeenCalledTimes(1);
    expect(headersOf(fetchMock, 1).Authorization).toBe(`Bearer ${TOKEN2}`);
  });

  test('does not loop when the fresh token is refused too', async () => {
    mocks.ensure.mockResolvedValue(TOKEN);
    const fetchMock = vi.fn(async () => json(401, { error: 'invalid_token' }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await authedFetch('/feedback')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('keeps the token when the 401 is about the api key', async () => {
    mocks.ensure.mockResolvedValue(TOKEN);
    const fetchMock = vi.fn(async () => json(401, { error: 'unauthorized' }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await authedFetch('/feedback');

    expect(res?.status).toBe(401);
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/authedFetch.test.ts`
Expected: FAIL — `Failed to load url ../src/services/api/authedFetch`.

- [ ] **Step 3: Minimal implementation**

```ts
// src/services/api/authedFetch.ts
import { clearDeviceToken, ensureDeviceToken } from '../deviceToken';
import { API_BASE_URL, API_KEY, REQUEST_TIMEOUT_MS, withTimeout } from './http';

// Device-scoped calls carry the public api key AND this device's token. The
// server says 'invalid_token' when it no longer knows the token (its device
// row was removed); that, and only that, is worth one fresh registration.

async function isInvalidToken(res: Response): Promise<boolean> {
  if (res.status !== 401) return false;
  try {
    const body = (await res.clone().json()) as { error?: unknown };
    return body.error === 'invalid_token';
  } catch {
    return false;
  }
}

export async function authedFetch(
  path: string,
  init: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown } = {},
): Promise<Response | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await ensureDeviceToken();
    if (!token) return null;

    const timeout = withTimeout(REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${API_BASE_URL}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          'x-api-key': API_KEY,
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: timeout.signal,
      });
    } catch {
      return null;
    } finally {
      timeout.clear();
    }

    if (!(await isInvalidToken(res))) return res;
    await clearDeviceToken();
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run test/authedFetch.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/api/authedFetch.ts test/authedFetch.test.ts
git commit -m "feat(app): authenticated fetch that re-registers once on an unknown token"
```

---

### Task 3: Move ping, push token and notification history to `/me/*`

**Files:**
- Modify: `src/services/api/backend.ts` (`pingDevice`, `registerPushToken`, `getNotificationHistory`), `src/hooks/useDevicePing.ts`, `src/hooks/usePushRegistration.ts:35-41`, `src/hooks/useNotificationHistory.ts`
- Test: `test/notificationsApi.test.ts` (rewrite), `test/backend.test.ts` (add mock at top; replace `describe('pingDevice')`)

**Interfaces:** Consumes: `authedFetch` (Task 2); server `POST /me/ping`, `PUT /me/push-token`, `GET /me/notifications`. Produces: `pingDevice(stationId?: string): Promise<void>`, `registerPushToken(pushToken: string | null): Promise<void>`, `getNotificationHistory(): Promise<StoredNotification[]>` — all never throw.

- [ ] **Step 1: Write the failing test**

```ts
// test/notificationsApi.test.ts
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock('../src/services/api/authedFetch', () => ({ authedFetch: mocks.authedFetch }));

import { getNotificationHistory, registerPushToken } from '../src/services/api/backend';

const TOKEN = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const ok = (rows: unknown) => new Response(JSON.stringify(rows), { status: 200 });

beforeEach(() => mocks.authedFetch.mockReset());

describe('registerPushToken', () => {
  test('sends the token as this device, with no deviceId', async () => {
    mocks.authedFetch.mockResolvedValue(new Response(null, { status: 204 }));

    await registerPushToken(TOKEN);

    expect(mocks.authedFetch).toHaveBeenCalledWith('/me/push-token', { method: 'PUT', body: { pushToken: TOKEN } });
  });

  test('sends null to turn notifications off', async () => {
    mocks.authedFetch.mockResolvedValue(new Response(null, { status: 204 }));
    await registerPushToken(null);
    expect(mocks.authedFetch).toHaveBeenCalledWith('/me/push-token', { method: 'PUT', body: { pushToken: null } });
  });

  test('never throws, because this runs on app start', async () => {
    mocks.authedFetch.mockRejectedValue(new Error('boom'));
    await expect(registerPushToken(TOKEN)).resolves.toBeUndefined();
  });
});

describe('getNotificationHistory', () => {
  test('asks for this device history', async () => {
    mocks.authedFetch.mockResolvedValue(ok([]));
    await getNotificationHistory();
    expect(mocks.authedFetch).toHaveBeenCalledWith('/me/notifications');
  });

  test('returns what it was given', async () => {
    const row = { id: '1', stationId: 'rosario', title: 'Rosario · 2.54 m', body: 'Subió 6 cm.', sentAt: '2026-09-15T10:00:00.000Z' };
    mocks.authedFetch.mockResolvedValue(ok([row]));
    expect(await getNotificationHistory()).toEqual([row]);
  });

  test('drops rows that are not a notification', async () => {
    mocks.authedFetch.mockResolvedValue(ok([
      { id: '1', stationId: 'rosario', title: 'T', body: 'B', sentAt: '2026-09-15T10:00:00.000Z' },
      { id: '2', title: 'sin fecha', body: 'B' },
    ]));
    expect(await getNotificationHistory()).toHaveLength(1);
  });

  test('returns an empty list without a token or network', async () => {
    mocks.authedFetch.mockResolvedValue(null);
    expect(await getNotificationHistory()).toEqual([]);
  });

  test('returns an empty list when the API errors', async () => {
    mocks.authedFetch.mockResolvedValue(new Response('{}', { status: 500 }));
    expect(await getNotificationHistory()).toEqual([]);
  });
});
```

In `test/backend.test.ts`, add right after the vitest import line:

```ts
const mocks = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock('../src/services/api/authedFetch', () => ({ authedFetch: mocks.authedFetch }));
```

and replace the whole `describe('pingDevice', …)` block with:

```ts
describe('pingDevice', () => {
  test('reports the station it is looking at, as this device', async () => {
    mocks.authedFetch.mockResolvedValue(new Response(null, { status: 204 }));

    await pingDevice('rosario');

    expect(mocks.authedFetch).toHaveBeenCalledWith('/me/ping', { method: 'POST', body: { stationId: 'rosario' } });
  });

  test('omits the station when none is open', async () => {
    mocks.authedFetch.mockResolvedValue(new Response(null, { status: 204 }));
    await pingDevice();
    expect(mocks.authedFetch).toHaveBeenCalledWith('/me/ping', { method: 'POST', body: {} });
  });

  test('never throws, because telemetry must not break a screen', async () => {
    mocks.authedFetch.mockRejectedValue(new Error('network down'));
    await expect(pingDevice('goya')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/notificationsApi.test.ts test/backend.test.ts`
Expected: FAIL — calls go to `/devices/push-token`, `/notifications?deviceId=…`, `/devices/ping` through global `fetch`, so `authedFetch` is never called.

- [ ] **Step 3: Minimal implementation**

In `src/services/api/backend.ts`, add `import { authedFetch } from './authedFetch';` and replace the three functions:

```ts
// Tells the backend that this device opened the app, and which station it is
// looking at. The device comes from its token; nothing about the person.
export async function pingDevice(stationId?: string): Promise<void> {
  try {
    await authedFetch('/me/ping', { method: 'POST', body: stationId ? { stationId } : {} });
  } catch {
    // Telemetry must never break a screen.
  }
}
```

```ts
// Register, replace, or clear this device's push token. Null turns
// notifications off. Never throws: it runs on app start.
export async function registerPushToken(pushToken: string | null): Promise<void> {
  try {
    await authedFetch('/me/push-token', { method: 'PUT', body: { pushToken } });
  } catch {
    // Registration retries on the next launch; it is not worth a visible error.
  }
}

// What this device was sent. Read from the server rather than kept on the
// device, so the list survives a reinstall and matches what was really sent.
export async function getNotificationHistory(): Promise<StoredNotification[]> {
  try {
    const res = await authedFetch('/me/notifications');
    if (!res || !res.ok) return [];
    const body: unknown = await res.json();
    if (!Array.isArray(body)) return [];
    return body.filter(isStoredNotification);
  } catch {
    return [];
  }
}
```

```ts
// src/hooks/useDevicePing.ts
import { useEffect } from 'react';

import { pingDevice } from '../services/api/backend';

/**
 * Reports that this device opened a screen, and which station it was looking
 * at. Fire and forget: it never blocks rendering and never surfaces an error.
 */
export function useDevicePing(stationId?: string): void {
  useEffect(() => {
    void pingDevice(stationId);
  }, [stationId]);
}
```

```ts
// src/hooks/useNotificationHistory.ts
import { useQuery } from '@tanstack/react-query';
import { getNotificationHistory } from '../services/api/backend';

export function useNotificationHistory() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => getNotificationHistory(),
    staleTime: 1000 * 60 * 5,
  });
}
```

In `src/hooks/usePushRegistration.ts`, remove the `getDeviceId` import and replace the tail of the async block (from `const deviceId = await getDeviceId();` to `await registerPushToken(deviceId, token);`) with:

```ts
      // Sent even when the token is null: that is how a device that turned
      // notifications off stops being counted as reachable.
      await registerPushToken(token);
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test:logic && npm run test:components && npm run typecheck`
Expected: all pass (the jest `NotificationsScreen` test mocks the hook and is unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/services/api/backend.ts src/hooks/useDevicePing.ts src/hooks/usePushRegistration.ts src/hooks/useNotificationHistory.ts test/notificationsApi.test.ts test/backend.test.ts
git commit -m "feat(app): send ping, push token and notification reads as the token's device"
```

---

### Task 4: Register on startup without blocking

**Files:**
- Create: `src/hooks/useDeviceRegistration.ts`
- Modify: `src/hooks/index.ts` (export), `app/_layout.tsx` (call it first in `RootLayout`)
- Test: `test/DeviceRegistration.test.tsx`

**Interfaces:** Consumes: `ensureDeviceToken` (Task 1). Produces: `useDeviceRegistration(): void`.

- [ ] **Step 1: Write the failing test**

```tsx
// test/DeviceRegistration.test.tsx
import { act, render, screen } from '@testing-library/react-native';
import { AppState, Text } from 'react-native';

const mockEnsure = jest.fn();
jest.mock('../src/services/deviceToken', () => ({ ensureDeviceToken: () => mockEnsure() }));

import { useDeviceRegistration } from '../src/hooks/useDeviceRegistration';

function Probe() {
  useDeviceRegistration();
  return <Text>pantalla</Text>;
}

let onChange: ((state: string) => void) | undefined;

beforeEach(() => {
  mockEnsure.mockReset();
  onChange = undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, listener: (s: string) => void) => {
    onChange = listener;
    return { remove: jest.fn() };
  }) as never);
});

afterEach(() => jest.restoreAllMocks());

test('starts registration on mount without waiting for it', () => {
  mockEnsure.mockReturnValue(new Promise(() => {}));
  render(<Probe />);

  expect(screen.getByText('pantalla')).toBeTruthy();
  expect(mockEnsure).toHaveBeenCalledTimes(1);
});

test('tries again when the app comes back to the foreground', () => {
  mockEnsure.mockResolvedValue(null);
  render(<Probe />);

  act(() => onChange?.('active'));
  act(() => onChange?.('background'));

  expect(mockEnsure).toHaveBeenCalledTimes(2);
});

test('swallows a rejected registration', async () => {
  mockEnsure.mockRejectedValue(new Error('unexpected'));
  render(<Probe />);
  await act(async () => {});
  expect(screen.getByText('pantalla')).toBeTruthy();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest test/DeviceRegistration.test.tsx`
Expected: FAIL — `Cannot find module '../src/hooks/useDeviceRegistration'`.

- [ ] **Step 3: Minimal implementation**

```ts
// src/hooks/useDeviceRegistration.ts
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { ensureDeviceToken } from '../services/deviceToken';

// Gets the device token early so the first authenticated call does not pay
// for it, and retries when the reader comes back after being offline. Every
// authenticated call also registers lazily, so nothing waits on this.
export function useDeviceRegistration(): void {
  useEffect(() => {
    const attempt = () => {
      ensureDeviceToken().catch(() => undefined);
    };
    attempt();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') attempt();
    });
    return () => sub.remove();
  }, []);
}
```

`src/hooks/index.ts` — add:

```ts
export { useDeviceRegistration } from './useDeviceRegistration';
```

`app/_layout.tsx` — import it alongside `usePushRegistration` and call it first:

```tsx
import { useDeviceRegistration, usePushRegistration } from '../src/hooks';
// …
export default function RootLayout() {
  useDeviceRegistration();
  usePushRegistration();
  useNotificationTaps();
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test:components && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useDeviceRegistration.ts src/hooks/index.ts app/_layout.tsx test/DeviceRegistration.test.tsx
git commit -m "feat(app): register the device token on startup and on return to foreground"
```

---

### Task 5: Feedback client and text rules

**Files:**
- Create: `src/services/api/feedbackApi.ts`, `src/services/feedbackText.ts`, `src/services/deviceInfo.ts`
- Test: `test/feedbackApi.test.ts`, `test/feedbackText.test.ts`

**Interfaces:** Consumes: `authedFetch` (Task 2); server `/feedback*` contract. Produces (`feedbackApi.ts`): types `FeedbackKind`, `ThreadStatus`, `FeedbackMessage`, `ThreadSummary`, `ThreadDetail` (identical to the server contract), `FeedbackFailure = 'offline' | 'limit' | 'invalid' | 'not_found' | 'unavailable'`, `FeedbackResult<T> = { ok: true; data: T } | { ok: false; reason: FeedbackFailure }`, `NewThreadInput = { kind: FeedbackKind; body: string; stationId?: string }`, `DeviceInfo = { appVersion: string; osVersion: string }`, `createThread(input, info): Promise<FeedbackResult<ThreadDetail>>`, `listThreads(): Promise<FeedbackResult<ThreadSummary[]>>`, `getThread(id: string): Promise<FeedbackResult<ThreadDetail>>`, `addMessage(threadId: string, body: string): Promise<FeedbackResult<FeedbackMessage>>`. (`feedbackText.ts`): `MAX_BODY_CHARS = 2000`, `COUNTER_FROM = 1800`, `countChars`, `canSend`, `isKind`, `osVersionLabel(os, version)`, `KIND_OPTIONS`, `STATUS_LABELS`, `FAILURE_COPY`, `THREAD_GONE`. (`deviceInfo.ts`): `deviceInfo(): DeviceInfo`.

- [ ] **Step 1: Write the failing test**

```ts
// test/feedbackText.test.ts
import { describe, expect, test } from 'vitest';
import { canSend, countChars, FAILURE_COPY, isKind, osVersionLabel, STATUS_LABELS } from '../src/services/feedbackText';

describe('countChars', () => {
  test('counts an emoji as one character, like the server', () => {
    expect('😀'.length).toBe(2);
    expect(countChars('😀')).toBe(1);
  });
});

describe('canSend', () => {
  test('allows 2000 emoji and refuses 2001', () => {
    expect(canSend('😀'.repeat(2000))).toBe(true);
    expect(canSend('😀'.repeat(2001))).toBe(false);
  });

  test('ignores surrounding whitespace and refuses an empty message', () => {
    expect(canSend(`  ${'a'.repeat(2000)}  `)).toBe(true);
    expect(canSend(' \n ')).toBe(false);
  });

  test('refuses a NUL byte the database would reject', () => {
    expect(canSend('a\u0000b')).toBe(false);
  });
});

describe('osVersionLabel', () => {
  test('produces something the server accepts', () => {
    expect(osVersionLabel('android', 34)).toBe('android 34');
    expect(osVersionLabel('ios', '18.1')).toBe('ios 18.1');
    expect(osVersionLabel('weird<os>', '1/2')).toMatch(/^[A-Za-z0-9 ._-]{1,40}$/);
    expect(osVersionLabel('', '')).toBe('unknown');
  });
});

describe('labels', () => {
  test('cover every kind, status and failure', () => {
    expect(isKind('bug')).toBe(true);
    expect(isKind('rant')).toBe(false);
    expect(STATUS_LABELS).toEqual({ open: 'Enviado', answered: 'Respondido', archived: 'Cerrado' });
    expect(Object.keys(FAILURE_COPY).sort()).toEqual(['invalid', 'limit', 'not_found', 'offline', 'unavailable']);
  });
});
```

```ts
// test/feedbackApi.test.ts
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock('../src/services/api/authedFetch', () => ({ authedFetch: mocks.authedFetch }));

import { addMessage, createThread, getThread, listThreads } from '../src/services/api/feedbackApi';

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const INFO = { appVersion: '2.2.0', osVersion: 'android 34' };
const message = { id: 'm1', author: 'device', body: 'Hola', createdAt: '2026-10-13T12:00:00.000Z' };
const summary = {
  id: ID, kind: 'bug', stationId: 'rosario', status: 'open', unread: false, preview: 'Hola',
  createdAt: '2026-10-13T12:00:00.000Z', updatedAt: '2026-10-13T12:00:00.000Z',
};
const detail = { ...summary, messages: [message] };
const res = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

beforeEach(() => mocks.authedFetch.mockReset());

describe('createThread', () => {
  test('posts the thread with the app and OS version', async () => {
    mocks.authedFetch.mockResolvedValue(res(201, detail));

    const result = await createThread({ kind: 'bug', body: 'Hola', stationId: 'rosario' }, INFO);

    expect(result).toEqual({ ok: true, data: detail });
    expect(mocks.authedFetch).toHaveBeenCalledWith('/feedback', {
      method: 'POST',
      body: { kind: 'bug', body: 'Hola', stationId: 'rosario', appVersion: '2.2.0', osVersion: 'android 34' },
    });
  });

  test('treats the 200 of a deduplicated retry as success', async () => {
    mocks.authedFetch.mockResolvedValue(res(200, detail));
    expect((await createThread({ kind: 'bug', body: 'Hola' }, INFO)).ok).toBe(true);
  });

  test.each([
    [null, 'offline'],
    [res(429, { error: 'limit', limit: 'threads' }), 'limit'],
    [res(400, { error: 'invalid', field: 'body' }), 'invalid'],
    [res(500, { error: 'internal' }), 'unavailable'],
    [res(201, { not: 'a thread' }), 'unavailable'],
  ])('maps %o to %s', async (response, reason) => {
    mocks.authedFetch.mockResolvedValue(response);
    expect(await createThread({ kind: 'bug', body: 'Hola' }, INFO)).toEqual({ ok: false, reason });
  });
});

describe('listThreads', () => {
  test('returns the summaries and drops malformed rows', async () => {
    mocks.authedFetch.mockResolvedValue(res(200, [summary, { id: 'x' }]));
    expect(await listThreads()).toEqual({ ok: true, data: [summary] });
    expect(mocks.authedFetch).toHaveBeenCalledWith('/feedback');
  });
});

describe('getThread', () => {
  test('returns one thread', async () => {
    mocks.authedFetch.mockResolvedValue(res(200, detail));
    expect(await getThread(ID)).toEqual({ ok: true, data: detail });
    expect(mocks.authedFetch).toHaveBeenCalledWith(`/feedback/${ID}`);
  });

  test('reports a thread that is gone', async () => {
    mocks.authedFetch.mockResolvedValue(res(404, { error: 'not_found' }));
    expect(await getThread(ID)).toEqual({ ok: false, reason: 'not_found' });
  });

  test('does not call the API for an id that cannot exist', async () => {
    expect(await getThread('../../stats')).toEqual({ ok: false, reason: 'not_found' });
    expect(mocks.authedFetch).not.toHaveBeenCalled();
  });
});

describe('addMessage', () => {
  test('posts the body to the thread', async () => {
    mocks.authedFetch.mockResolvedValue(res(201, message));
    expect(await addMessage(ID, 'Hola')).toEqual({ ok: true, data: message });
    expect(mocks.authedFetch).toHaveBeenCalledWith(`/feedback/${ID}/messages`, { method: 'POST', body: { body: 'Hola' } });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/feedbackText.test.ts test/feedbackApi.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Minimal implementation**

```ts
// src/services/api/feedbackApi.ts
import { authedFetch } from './authedFetch';

// The in-app feedback API. Every call resolves to a result rather than
// throwing, so a screen can keep what the reader typed and say why it failed.

export type FeedbackKind = 'suggestion' | 'bug' | 'question';
export type ThreadStatus = 'open' | 'answered' | 'archived';

export interface FeedbackMessage {
  id: string;
  author: 'device' | 'admin';
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

export type FeedbackFailure = 'offline' | 'limit' | 'invalid' | 'not_found' | 'unavailable';
export type FeedbackResult<T> = { ok: true; data: T } | { ok: false; reason: FeedbackFailure };

export interface NewThreadInput {
  kind: FeedbackKind;
  body: string;
  stationId?: string;
}

export interface DeviceInfo {
  appVersion: string;
  osVersion: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = ['suggestion', 'bug', 'question'];
const STATUSES = ['open', 'answered', 'archived'];

const isString = (v: unknown): v is string => typeof v === 'string';
const isDate = (v: unknown) => isString(v) && Number.isFinite(Date.parse(v));

function isMessage(v: unknown): v is FeedbackMessage {
  if (typeof v !== 'object' || v === null) return false;
  const m = v as Record<string, unknown>;
  return isString(m.id) && (m.author === 'device' || m.author === 'admin') && isString(m.body) && isDate(m.createdAt);
}

function isSummary(v: unknown): v is ThreadSummary {
  if (typeof v !== 'object' || v === null) return false;
  const t = v as Record<string, unknown>;
  return (
    isString(t.id) && KINDS.includes(t.kind as string) && (t.stationId === null || isString(t.stationId)) &&
    STATUSES.includes(t.status as string) && typeof t.unread === 'boolean' && isString(t.preview) &&
    isDate(t.createdAt) && isDate(t.updatedAt)
  );
}

function isDetail(v: unknown): v is ThreadDetail {
  return isSummary(v) && Array.isArray((v as ThreadDetail).messages) && (v as ThreadDetail).messages.every(isMessage);
}

function failureFor(status: number): FeedbackFailure {
  if (status === 429) return 'limit';
  if (status === 400) return 'invalid';
  if (status === 404) return 'not_found';
  return 'unavailable';
}

async function read<T>(res: Response | null, accept: (body: unknown) => T | null): Promise<FeedbackResult<T>> {
  if (!res) return { ok: false, reason: 'offline' };
  if (!res.ok) return { ok: false, reason: failureFor(res.status) };
  try {
    const data = accept(await res.json());
    return data === null ? { ok: false, reason: 'unavailable' } : { ok: true, data };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

export async function createThread(input: NewThreadInput, info: DeviceInfo): Promise<FeedbackResult<ThreadDetail>> {
  const res = await authedFetch('/feedback', { method: 'POST', body: { ...input, ...info } });
  return read(res, (b) => (isDetail(b) ? b : null));
}

export async function listThreads(): Promise<FeedbackResult<ThreadSummary[]>> {
  const res = await authedFetch('/feedback');
  return read(res, (b) => (Array.isArray(b) ? b.filter(isSummary) : null));
}

export async function getThread(id: string): Promise<FeedbackResult<ThreadDetail>> {
  if (!UUID.test(id)) return { ok: false, reason: 'not_found' };
  const res = await authedFetch(`/feedback/${id}`);
  return read(res, (b) => (isDetail(b) ? b : null));
}

export async function addMessage(threadId: string, body: string): Promise<FeedbackResult<FeedbackMessage>> {
  if (!UUID.test(threadId)) return { ok: false, reason: 'not_found' };
  const res = await authedFetch(`/feedback/${threadId}/messages`, { method: 'POST', body: { body } });
  return read(res, (b) => (isMessage(b) ? b : null));
}
```

```ts
// src/services/feedbackText.ts
import type { FeedbackFailure, FeedbackKind, ThreadStatus } from './api/feedbackApi';

// The same rules the server applies, so the button is only enabled for text
// the server will accept. Counted in code points: an emoji is one character.
export const MAX_BODY_CHARS = 2000;
export const COUNTER_FROM = 1800;

export function countChars(s: string): number {
  return [...s].length;
}

export function canSend(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && countChars(t) <= MAX_BODY_CHARS && !t.includes('\u0000');
}

export function isKind(v: unknown): v is FeedbackKind {
  return v === 'suggestion' || v === 'bug' || v === 'question';
}

export function osVersionLabel(os: string, version: string | number): string {
  const label = `${os} ${String(version)}`.replace(/[^A-Za-z0-9 ._-]/g, '').trim().slice(0, 40);
  return label.length > 0 ? label : 'unknown';
}

export const KIND_OPTIONS: Array<{ kind: FeedbackKind; label: string }> = [
  { kind: 'suggestion', label: 'Sugerencia' },
  { kind: 'bug', label: 'Error' },
  { kind: 'question', label: 'Consulta' },
];

export const STATUS_LABELS: Record<ThreadStatus, string> = {
  open: 'Enviado',
  answered: 'Respondido',
  archived: 'Cerrado',
};

export const THREAD_GONE = 'Esta conversación ya no está disponible.';

export const FAILURE_COPY: Record<FeedbackFailure, string> = {
  offline: 'No pudimos enviar tu mensaje. Revisá tu conexión y probá de nuevo.',
  limit: 'Llegaste al límite de mensajes por hoy. Probá de nuevo mañana.',
  invalid: 'Revisá el mensaje: no puede estar vacío ni superar 2000 caracteres.',
  not_found: THREAD_GONE,
  unavailable: 'El servicio no está disponible ahora. Probá de nuevo en un rato.',
};
```

```ts
// src/services/deviceInfo.ts
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { DeviceInfo } from './api/feedbackApi';
import { osVersionLabel } from './feedbackText';

// What the owner needs to reproduce a reported error, and nothing more.
export function deviceInfo(): DeviceInfo {
  return {
    appVersion: Constants.expoConfig?.version ?? '0.0.0',
    osVersion: osVersionLabel(Platform.OS, Platform.Version),
  };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test:logic && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/api/feedbackApi.ts src/services/feedbackText.ts src/services/deviceInfo.ts test/feedbackApi.test.ts test/feedbackText.test.ts
git commit -m "feat(app): typed feedback client and the server's text rules on the device"
```

---

### Task 6: "Contacto y sugerencias" screen

**Files:**
- Create: `src/hooks/useFeedback.ts`, `src/components/feedback/KindChips.tsx`, `src/components/feedback/StatusPill.tsx`, `app/contacto/index.tsx`
- Modify: `src/hooks/index.ts` (exports), `app/_layout.tsx` (register `contacto/index` and `contacto/[threadId]` in the `Stack`)
- Test: `test/ContactScreen.test.tsx`

**Interfaces:** Consumes: Task 5 client, `deviceInfo`, text helpers; `getStationById` (`src/config/stations.ts`). Produces: `FEEDBACK_KEY = ['feedback']`, `useFeedbackThreads()` (query → `ThreadSummary[]`), `useFeedbackThread(threadId)` (query → `FeedbackResult<ThreadDetail>`), `useSendFeedback()` (mutation `NewThreadInput → FeedbackResult<ThreadDetail>`), `useReplyToThread(threadId)` (mutation `string → FeedbackResult<FeedbackMessage>`); `<KindChips value onChange />`, `<StatusPill status unread />`; route `/contacto?kind=&stationId=`.

- [ ] **Step 1: Write the failing test**

```tsx
// test/ContactScreen.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import ContactScreen from '../app/contacto/index';

const mockSend = jest.fn();
const mockThreads = jest.fn();
jest.mock('../src/hooks', () => ({
  useSendFeedback: () => ({ mutateAsync: mockSend, isPending: false }),
  useFeedbackThreads: () => mockThreads(),
}));

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => mockParams,
}));

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockThreads.mockReturnValue({ data: [] });
  mockSend.mockResolvedValue({ ok: true, data: { id: ID } });
});

const type = (text: string) => fireEvent.changeText(screen.getByTestId('feedback-input'), text);
const send = () => fireEvent.press(screen.getByTestId('feedback-send'));

describe('ContactScreen', () => {
  test('offers the three kinds, Sugerencia first, and the privacy line', () => {
    render(<ContactScreen />);

    expect(screen.getByRole('radio', { name: 'Sugerencia', checked: true })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Error', checked: false })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Consulta', checked: false })).toBeTruthy();
    expect(screen.getByText('Te respondemos acá. No hace falta mail ni datos personales.')).toBeTruthy();
  });

  test('arrives from a station with Error chosen and the station attached', () => {
    mockParams = { kind: 'bug', stationId: 'rosario' };
    render(<ContactScreen />);

    expect(screen.getByRole('radio', { name: 'Error', checked: true })).toBeTruthy();
    expect(screen.getByText('Sobre: Rosario')).toBeTruthy();
  });

  test('ignores a station the app does not know', () => {
    mockParams = { kind: 'bug', stationId: 'atlantis' };
    render(<ContactScreen />);
    expect(screen.queryByText(/Sobre:/)).toBeNull();
  });

  test('sends kind, trimmed text and station, then opens the thread', async () => {
    mockParams = { kind: 'bug', stationId: 'rosario' };
    render(<ContactScreen />);

    type('  El dato de Rosario es de ayer  ');
    send();

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(`/contacto/${ID}`));
    expect(mockSend).toHaveBeenCalledWith({ kind: 'bug', body: 'El dato de Rosario es de ayer', stationId: 'rosario' });
  });

  test('drops the station when its chip is removed', async () => {
    mockParams = { kind: 'bug', stationId: 'rosario' };
    render(<ContactScreen />);

    fireEvent.press(screen.getByLabelText('Quitar estación'));
    type('Hola');
    send();

    await waitFor(() => expect(mockSend).toHaveBeenCalledWith({ kind: 'bug', body: 'Hola' }));
    expect(screen.queryByText('Sobre: Rosario')).toBeNull();
  });

  test('does not send an empty message', () => {
    render(<ContactScreen />);
    type('   ');
    send();
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('keeps the text and offers a retry when offline', async () => {
    mockSend.mockResolvedValue({ ok: false, reason: 'offline' });
    render(<ContactScreen />);

    type('No carga el río');
    send();

    expect(await screen.findByText('No pudimos enviar tu mensaje. Revisá tu conexión y probá de nuevo.')).toBeTruthy();
    expect(screen.getByTestId('feedback-input').props.value).toBe('No carga el río');
    expect(screen.getByText('Reintentar')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  test('explains the daily limit', async () => {
    mockSend.mockResolvedValue({ ok: false, reason: 'limit' });
    render(<ContactScreen />);
    type('Uno más');
    send();
    expect(await screen.findByText('Llegaste al límite de mensajes por hoy. Probá de nuevo mañana.')).toBeTruthy();
  });

  test('sends once on a double tap', () => {
    mockSend.mockReturnValue(new Promise(() => {}));
    render(<ContactScreen />);

    type('Hola');
    send();
    send();

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test('counts emoji as one character', () => {
    render(<ContactScreen />);

    type('😀'.repeat(2000));
    expect(screen.getByText('2000/2000')).toBeTruthy();
    send();
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test('will not send past 2000 characters', () => {
    render(<ContactScreen />);
    type('😀'.repeat(2001));
    send();
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('lists my threads with status and an unread dot, and opens one', () => {
    mockThreads.mockReturnValue({
      data: [{
        id: ID, kind: 'bug', stationId: 'rosario', status: 'answered', unread: true, preview: 'El dato es viejo',
        createdAt: '2026-10-13T12:00:00.000Z', updatedAt: '2026-10-13T13:00:00.000Z',
      }],
    });
    render(<ContactScreen />);

    expect(screen.getByText('Mis mensajes')).toBeTruthy();
    expect(screen.getByText('Respondido')).toBeTruthy();
    expect(screen.getByLabelText('Respuesta sin leer')).toBeTruthy();

    fireEvent.press(screen.getByText('El dato es viejo'));
    expect(mockPush).toHaveBeenCalledWith(`/contacto/${ID}`);
  });

  test('hides "Mis mensajes" when there are none', () => {
    render(<ContactScreen />);
    expect(screen.queryByText('Mis mensajes')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest test/ContactScreen.test.tsx`
Expected: FAIL — `Cannot find module '../app/contacto/index'`.

- [ ] **Step 3: Minimal implementation**

```ts
// src/hooks/useFeedback.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { addMessage, createThread, getThread, listThreads, type NewThreadInput } from '../services/api/feedbackApi';
import { deviceInfo } from '../services/deviceInfo';

export const FEEDBACK_KEY = ['feedback'] as const;

export function useFeedbackThreads() {
  return useQuery({
    queryKey: [...FEEDBACK_KEY, 'list'],
    queryFn: async () => {
      const result = await listThreads();
      return result.ok ? result.data : [];
    },
    staleTime: 30_000,
  });
}

/** Opening a thread clears its unread flag on the server, so the list is refreshed after. */
export function useFeedbackThread(threadId: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: [...FEEDBACK_KEY, 'thread', threadId],
    enabled: threadId.length > 0,
    queryFn: async () => {
      const result = await getThread(threadId);
      if (result.ok) void queryClient.invalidateQueries({ queryKey: [...FEEDBACK_KEY, 'list'] });
      return result;
    },
  });
}

export function useSendFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewThreadInput) => createThread(input, deviceInfo()),
    onSuccess: (result) => {
      if (result.ok) void queryClient.invalidateQueries({ queryKey: FEEDBACK_KEY });
    },
  });
}

export function useReplyToThread(threadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => addMessage(threadId, body),
    onSuccess: (result) => {
      if (result.ok) void queryClient.invalidateQueries({ queryKey: FEEDBACK_KEY });
    },
  });
}
```

`src/hooks/index.ts` — add:

```ts
export { useFeedbackThreads, useFeedbackThread, useSendFeedback, useReplyToThread, FEEDBACK_KEY } from './useFeedback';
```

```tsx
// src/components/feedback/KindChips.tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { FeedbackKind } from '../../services/api/feedbackApi';
import { KIND_OPTIONS } from '../../services/feedbackText';
import { BORDER_RADIUS, COLORS, FONT_SIZES, SPACING } from '../../config/theme';

export function KindChips({ value, onChange }: { value: FeedbackKind; onChange: (k: FeedbackKind) => void }) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {KIND_OPTIONS.map(({ kind, label }) => {
        const selected = kind === value;
        return (
          <Pressable
            key={kind}
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(kind)}
            style={[styles.chip, selected && styles.selected]}
          >
            <Text style={[styles.text, selected && styles.selectedText]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  chip: { paddingHorizontal: SPACING.md, paddingVertical: 6, borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.cream, borderWidth: 1, borderColor: COLORS.sand },
  selected: { backgroundColor: COLORS.river, borderColor: COLORS.river },
  text: { fontFamily: 'Nunito_600SemiBold', fontSize: FONT_SIZES.sm, color: COLORS.earth },
  selectedText: { color: COLORS.white },
});
```

```tsx
// src/components/feedback/StatusPill.tsx
import { StyleSheet, Text, View } from 'react-native';

import type { ThreadStatus } from '../../services/api/feedbackApi';
import { STATUS_LABELS } from '../../services/feedbackText';
import { BORDER_RADIUS, COLORS, FONT_SIZES, SPACING } from '../../config/theme';

const TONES: Record<ThreadStatus, { bg: string; fg: string }> = {
  open: { bg: COLORS.infoLight, fg: COLORS.riverDark },
  answered: { bg: COLORS.successLight, fg: COLORS.success },
  archived: { bg: COLORS.sandLight, fg: COLORS.earthLight },
};

export function StatusPill({ status, unread }: { status: ThreadStatus; unread: boolean }) {
  const tone = TONES[status];
  return (
    <View style={styles.row}>
      <View style={[styles.pill, { backgroundColor: tone.bg }]}>
        <Text style={[styles.text, { color: tone.fg }]}>{STATUS_LABELS[status]}</Text>
      </View>
      {unread && <View style={styles.dot} accessibilityLabel="Respuesta sin leer" accessible />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  pill: { paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: BORDER_RADIUS.full },
  text: { fontFamily: 'Nunito_600SemiBold', fontSize: FONT_SIZES.xs },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.emergency },
});
```

```tsx
// app/contacto/index.tsx
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { FontAwesome6 } from '@expo/vector-icons';

import { Card } from '../../src/components/ui';
import { KindChips } from '../../src/components/feedback/KindChips';
import { StatusPill } from '../../src/components/feedback/StatusPill';
import { useFeedbackThreads, useSendFeedback } from '../../src/hooks';
import { getStationById } from '../../src/config/stations';
import type { FeedbackKind } from '../../src/services/api/feedbackApi';
import {
  canSend, countChars, COUNTER_FROM, FAILURE_COPY, isKind, KIND_OPTIONS, MAX_BODY_CHARS,
} from '../../src/services/feedbackText';
import { BORDER_RADIUS, COLORS, FONT_SIZES, SPACING } from '../../src/config/theme';

export default function ContactScreen() {
  const params = useLocalSearchParams<{ kind?: string; stationId?: string }>();
  const router = useRouter();
  const [kind, setKind] = useState<FeedbackKind>(isKind(params.kind) ? params.kind : 'suggestion');
  const [stationId, setStationId] = useState<string | null>(
    params.stationId && getStationById(params.stationId) ? params.stationId : null,
  );
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  // The second tap of a double tap arrives before isPending re-renders.
  const sending = useRef(false);
  const send = useSendFeedback();
  const { data: threads } = useFeedbackThreads();

  const station = stationId ? getStationById(stationId) : undefined;
  const chars = countChars(text.trim());
  const sendable = canSend(text) && !send.isPending;

  const onSend = async () => {
    if (!sendable || sending.current) return;
    sending.current = true;
    setError(null);
    try {
      const result = await send.mutateAsync({ kind, body: text.trim(), ...(stationId ? { stationId } : {}) });
      if (result.ok) {
        setText('');
        router.push(`/contacto/${result.data.id}`);
      } else {
        setError(FAILURE_COPY[result.reason]);
      }
    } finally {
      sending.current = false;
    }
  };

  const kindLabel = (k: FeedbackKind) => KIND_OPTIONS.find((o) => o.kind === k)?.label ?? '';

  return (
    <>
      <Stack.Screen options={{ title: 'Contacto y sugerencias' }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <KindChips value={kind} onChange={setKind} />

          {station && (
            <View style={styles.stationChip}>
              <Text style={styles.stationText}>Sobre: {station.name}</Text>
              <Pressable accessibilityLabel="Quitar estación" onPress={() => setStationId(null)} hitSlop={8}>
                <FontAwesome6 name="xmark" size={12} color={COLORS.earth} />
              </Pressable>
            </View>
          )}

          <TextInput
            testID="feedback-input"
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Contanos qué viste o qué te gustaría que tenga la app"
            placeholderTextColor={COLORS.earthLight}
            multiline
            textAlignVertical="top"
          />
          {chars >= COUNTER_FROM && (
            <Text style={[styles.counter, chars > MAX_BODY_CHARS && styles.counterOver]}>
              {chars}/{MAX_BODY_CHARS}
            </Text>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            testID="feedback-send"
            accessibilityRole="button"
            disabled={!sendable}
            onPress={onSend}
            style={[styles.button, !sendable && styles.buttonDisabled]}
          >
            <Text style={styles.buttonText}>{error ? 'Reintentar' : 'Enviar'}</Text>
          </Pressable>

          <Text style={styles.privacy}>Te respondemos acá. No hace falta mail ni datos personales.</Text>
        </Card>

        {threads && threads.length > 0 && (
          <Card>
            <Text style={styles.sectionTitle}>Mis mensajes</Text>
            {threads.map((t) => (
              <Pressable key={t.id} style={styles.threadRow} onPress={() => router.push(`/contacto/${t.id}`)}>
                <View style={styles.threadText}>
                  <Text style={styles.threadKind}>{kindLabel(t.kind)}</Text>
                  <Text style={styles.threadPreview} numberOfLines={2}>{t.preview}</Text>
                </View>
                <StatusPill status={t.status} unread={t.unread} />
              </Pressable>
            ))}
          </Card>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.sandLight },
  content: { padding: SPACING.base },
  stationChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: SPACING.sm, backgroundColor: COLORS.infoLight, borderRadius: BORDER_RADIUS.full, paddingHorizontal: SPACING.md, paddingVertical: 4, marginBottom: SPACING.md },
  stationText: { fontFamily: 'Nunito_600SemiBold', fontSize: FONT_SIZES.sm, color: COLORS.riverDark },
  input: { minHeight: 120, borderWidth: 1, borderColor: COLORS.sand, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, fontFamily: 'Nunito_400Regular', fontSize: FONT_SIZES.base, color: COLORS.earthDark, backgroundColor: COLORS.white },
  counter: { alignSelf: 'flex-end', marginTop: SPACING.xs, fontSize: FONT_SIZES.xs, color: COLORS.earthLight, fontFamily: 'Nunito_400Regular' },
  counterOver: { color: COLORS.emergency },
  error: { marginTop: SPACING.sm, color: COLORS.emergency, fontFamily: 'Nunito_600SemiBold', fontSize: FONT_SIZES.sm },
  button: { marginTop: SPACING.md, backgroundColor: COLORS.river, borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.md, alignItems: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: COLORS.white, fontFamily: 'Nunito_700Bold', fontSize: FONT_SIZES.md },
  privacy: { marginTop: SPACING.sm, fontSize: FONT_SIZES.sm, color: COLORS.earthLight, fontFamily: 'Nunito_400Regular', textAlign: 'center' },
  sectionTitle: { fontSize: FONT_SIZES.sm, color: COLORS.earthLight, marginBottom: SPACING.sm, fontFamily: 'Nunito_600SemiBold' },
  threadRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.sandLight, gap: SPACING.sm },
  threadText: { flex: 1 },
  threadKind: { fontFamily: 'Nunito_700Bold', fontSize: FONT_SIZES.sm, color: COLORS.earthDark },
  threadPreview: { fontFamily: 'Nunito_400Regular', fontSize: FONT_SIZES.sm, color: COLORS.earth },
});
```

`app/_layout.tsx` — inside `<Stack>`, after the `notificaciones` screen:

```tsx
          <Stack.Screen
            name="contacto/index"
            options={{ title: 'Contacto y sugerencias', headerBackTitle: 'Volver' }}
          />
          <Stack.Screen
            name="contacto/[threadId]"
            options={{ title: 'Conversación', headerBackTitle: 'Volver' }}
          />
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test:components && npm run typecheck`
Expected: PASS. If `getByRole('radio', { checked })` is not matched, check that `accessibilityState={{ checked }}` is set on the `Pressable` (RNTL reads it from the host view).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useFeedback.ts src/hooks/index.ts src/components/feedback/KindChips.tsx src/components/feedback/StatusPill.tsx app/contacto/index.tsx app/_layout.tsx test/ContactScreen.test.tsx
git commit -m "feat(app): contact screen with kinds, station chip, send/retry and my threads"
```

---

### Task 7: Thread screen

**Files:**
- Create: `src/components/feedback/MessageBubble.tsx`, `app/contacto/[threadId].tsx`
- Test: `test/ThreadScreen.test.tsx`

**Interfaces:** Consumes: `useFeedbackThread`, `useReplyToThread` (Task 6), `canSend`, `FAILURE_COPY`, `THREAD_GONE` (Task 5). Produces: route `/contacto/<threadId>`; `<MessageBubble message />`.

- [ ] **Step 1: Write the failing test**

```tsx
// test/ThreadScreen.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import ThreadScreen from '../app/contacto/[threadId]';

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const mockThread = jest.fn();
const mockReply = jest.fn();
const mockRefetch = jest.fn();
jest.mock('../src/hooks', () => ({
  useFeedbackThread: () => mockThread(),
  useReplyToThread: () => ({ mutateAsync: mockReply, isPending: false }),
}));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ threadId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
}));

const detail = {
  id: ID, kind: 'bug', stationId: 'rosario', status: 'answered', unread: false, preview: 'El dato es viejo',
  createdAt: '2026-10-13T12:00:00.000Z', updatedAt: '2026-10-13T13:00:00.000Z',
  messages: [
    { id: 'm1', author: 'device', body: 'El dato es viejo', createdAt: '2026-10-13T12:00:00.000Z' },
    { id: 'm2', author: 'admin', body: 'Gracias, ya lo corregimos', createdAt: '2026-10-13T13:00:00.000Z' },
  ],
};
const loaded = (data: unknown) => mockThread.mockReturnValue({ data, isLoading: false, refetch: mockRefetch });
const type = (t: string) => fireEvent.changeText(screen.getByTestId('thread-reply-input'), t);
const send = () => fireEvent.press(screen.getByTestId('thread-reply-send'));

beforeEach(() => {
  jest.clearAllMocks();
  loaded({ ok: true, data: detail });
  mockReply.mockResolvedValue({ ok: true, data: { id: 'm3' } });
});

describe('ThreadScreen', () => {
  test('shows the conversation in order, signed', () => {
    render(<ThreadScreen />);

    const bodies = screen.getAllByText(/El dato es viejo|Gracias, ya lo corregimos/).map((n) => n.props.children);
    expect(bodies).toEqual(['El dato es viejo', 'Gracias, ya lo corregimos']);
    expect(screen.getByText('Paraná Info')).toBeTruthy();
    expect(screen.getByText('Vos')).toBeTruthy();
  });

  test('sends a reply and clears the box', async () => {
    render(<ThreadScreen />);

    type('  Gracias!  ');
    send();

    await waitFor(() => expect(mockReply).toHaveBeenCalledWith('Gracias!'));
    await waitFor(() => expect(screen.getByTestId('thread-reply-input').props.value).toBe(''));
  });

  test('keeps a failed reply in the box', async () => {
    mockReply.mockResolvedValue({ ok: false, reason: 'offline' });
    render(<ThreadScreen />);

    type('Sigue igual');
    send();

    expect(await screen.findByText('No pudimos enviar tu mensaje. Revisá tu conexión y probá de nuevo.')).toBeTruthy();
    expect(screen.getByTestId('thread-reply-input').props.value).toBe('Sigue igual');
    expect(screen.getByText('Reintentar')).toBeTruthy();
  });

  test('replies once on a double tap', () => {
    mockReply.mockReturnValue(new Promise(() => {}));
    render(<ThreadScreen />);
    type('Hola');
    send();
    send();
    expect(mockReply).toHaveBeenCalledTimes(1);
  });

  test('says so when the thread is gone', () => {
    loaded({ ok: false, reason: 'not_found' });
    render(<ThreadScreen />);
    expect(screen.getByText('Esta conversación ya no está disponible.')).toBeTruthy();
    expect(screen.queryByTestId('thread-reply-input')).toBeNull();
  });

  test('offers to try again when the thread could not load', () => {
    loaded({ ok: false, reason: 'offline' });
    render(<ThreadScreen />);

    fireEvent.press(screen.getByText('Reintentar'));

    expect(mockRefetch).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest test/ThreadScreen.test.tsx`
Expected: FAIL — `Cannot find module '../app/contacto/[threadId]'`.

- [ ] **Step 3: Minimal implementation**

```tsx
// src/components/feedback/MessageBubble.tsx
import { StyleSheet, Text, View } from 'react-native';
import { format } from 'date-fns';

import type { FeedbackMessage } from '../../services/api/feedbackApi';
import { BORDER_RADIUS, COLORS, FONT_SIZES, SPACING } from '../../config/theme';

export function MessageBubble({ message }: { message: FeedbackMessage }) {
  const fromOwner = message.author === 'admin';
  return (
    <View style={[styles.bubble, fromOwner ? styles.owner : styles.mine]}>
      <Text style={styles.body}>{message.body}</Text>
      <View style={styles.meta}>
        <Text style={styles.signature}>{fromOwner ? 'Paraná Info' : 'Vos'}</Text>
        <Text style={styles.time}>{format(new Date(message.createdAt), 'd/M HH:mm')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '85%', borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm },
  mine: { alignSelf: 'flex-end', backgroundColor: COLORS.white },
  owner: { alignSelf: 'flex-start', backgroundColor: COLORS.infoLight },
  body: { fontFamily: 'Nunito_400Regular', fontSize: FONT_SIZES.base, color: COLORS.earthDark, lineHeight: 20 },
  meta: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs },
  signature: { fontFamily: 'Nunito_700Bold', fontSize: FONT_SIZES.xs, color: COLORS.riverDark },
  time: { fontFamily: 'Nunito_400Regular', fontSize: FONT_SIZES.xs, color: COLORS.earthLight },
});
```

```tsx
// app/contacto/[threadId].tsx
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';

import { MessageBubble } from '../../src/components/feedback/MessageBubble';
import { useFeedbackThread, useReplyToThread } from '../../src/hooks';
import { canSend, FAILURE_COPY, THREAD_GONE } from '../../src/services/feedbackText';
import { BORDER_RADIUS, COLORS, FONT_SIZES, SPACING } from '../../src/config/theme';

export default function ThreadScreen() {
  const { threadId = '' } = useLocalSearchParams<{ threadId: string }>();
  const { data, isLoading, refetch } = useFeedbackThread(threadId);
  const reply = useReplyToThread(threadId);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  const sendable = canSend(text) && !reply.isPending;

  const onSend = async () => {
    if (!sendable || sending.current) return;
    sending.current = true;
    setError(null);
    try {
      const result = await reply.mutateAsync(text.trim());
      if (result.ok) setText('');
      else setError(FAILURE_COPY[result.reason]);
    } finally {
      sending.current = false;
    }
  };

  const header = <Stack.Screen options={{ title: 'Conversación' }} />;

  if (isLoading) {
    return (<>{header}<View style={styles.centre}><ActivityIndicator size="small" color={COLORS.river} /></View></>);
  }

  if (!data || !data.ok) {
    const reason = data && !data.ok ? data.reason : 'unavailable';
    return (
      <>
        {header}
        <View style={styles.centre}>
          <Text style={styles.notice}>{reason === 'not_found' ? THREAD_GONE : FAILURE_COPY[reason]}</Text>
          {reason !== 'not_found' && (
            <Pressable accessibilityRole="button" onPress={() => refetch()} style={styles.button}>
              <Text style={styles.buttonText}>Reintentar</Text>
            </Pressable>
          )}
        </View>
      </>
    );
  }

  return (
    <>
      {header}
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {data.data.messages.map((m) => <MessageBubble key={m.id} message={m} />)}

        <TextInput
          testID="thread-reply-input"
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Escribí tu mensaje"
          placeholderTextColor={COLORS.earthLight}
          multiline
          textAlignVertical="top"
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable
          testID="thread-reply-send"
          accessibilityRole="button"
          disabled={!sendable}
          onPress={onSend}
          style={[styles.button, !sendable && styles.buttonDisabled]}
        >
          <Text style={styles.buttonText}>{error ? 'Reintentar' : 'Enviar'}</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.sandLight },
  content: { padding: SPACING.base },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, backgroundColor: COLORS.sandLight },
  notice: { fontFamily: 'Nunito_600SemiBold', fontSize: FONT_SIZES.md, color: COLORS.earth, textAlign: 'center' },
  input: { minHeight: 80, marginTop: SPACING.md, borderWidth: 1, borderColor: COLORS.sand, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, fontFamily: 'Nunito_400Regular', fontSize: FONT_SIZES.base, color: COLORS.earthDark, backgroundColor: COLORS.white },
  error: { marginTop: SPACING.sm, color: COLORS.emergency, fontFamily: 'Nunito_600SemiBold', fontSize: FONT_SIZES.sm },
  button: { marginTop: SPACING.md, backgroundColor: COLORS.river, borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.md, paddingHorizontal: SPACING.xl, alignItems: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: COLORS.white, fontFamily: 'Nunito_700Bold', fontSize: FONT_SIZES.md },
});
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test:components && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/feedback/MessageBubble.tsx "app/contacto/[threadId].tsx" test/ThreadScreen.test.tsx
git commit -m "feat(app): thread screen with signed bubbles, reply and gone/offline states"
```

---

### Task 8: The three entry points

**Files:**
- Create: `src/components/feedback/FeedbackHomeCard.tsx`, `src/components/feedback/StationReportLink.tsx`
- Modify: `app/(tabs)/profile.tsx` (contact row above `DataSourcesSection`), `app/(tabs)/index.tsx` (card after the news `Card`, before `</ScrollView>` at line 193), `app/river/[stationId].tsx` (link after `<RiverTrend stationId={station.id} />`, line 163)
- Test: `test/FeedbackEntryPoints.test.tsx`

**Interfaces:** Consumes: route `/contacto` (Task 6). Produces: `<FeedbackHomeCard />`, `<StationReportLink stationId />`.

- [ ] **Step 1: Write the failing test**

```tsx
// test/FeedbackEntryPoints.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { FeedbackHomeCard } from '../src/components/feedback/FeedbackHomeCard';
import { StationReportLink } from '../src/components/feedback/StationReportLink';
import ProfileScreen from '../app/(tabs)/profile';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

beforeEach(() => mockPush.mockReset());

test('Inicio invites a message in the spec words', () => {
  render(<FeedbackHomeCard />);

  fireEvent.press(screen.getByText('¿Una idea o un error? Escribinos: leemos todo y te respondemos acá en la app.'));

  expect(mockPush).toHaveBeenCalledWith('/contacto');
});

test('a station screen reports an error about that station', () => {
  render(<StationReportLink stationId="rosario" />);

  fireEvent.press(screen.getByText('¿Ves algo mal en este dato? Avisanos →'));

  expect(mockPush).toHaveBeenCalledWith({ pathname: '/contacto', params: { kind: 'bug', stationId: 'rosario' } });
});

test('Perfil has a row for contact and suggestions', () => {
  render(<ProfileScreen />);

  fireEvent.press(screen.getByText('Contacto y sugerencias'));

  expect(mockPush).toHaveBeenCalledWith('/contacto');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest test/FeedbackEntryPoints.test.tsx`
Expected: FAIL — components not found; Profile has no such row.

- [ ] **Step 3: Minimal implementation**

```tsx
// src/components/feedback/FeedbackHomeCard.tsx
import { Pressable, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome6 } from '@expo/vector-icons';

import { BORDER_RADIUS, COLORS, FONT_SIZES, SPACING } from '../../config/theme';

export function FeedbackHomeCard() {
  const router = useRouter();
  return (
    <Pressable accessibilityRole="button" style={styles.card} onPress={() => router.push('/contacto')}>
      <FontAwesome6 name="comment-dots" size={18} color={COLORS.river} />
      <Text style={styles.text}>¿Una idea o un error? Escribinos: leemos todo y te respondemos acá en la app.</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: COLORS.cream, borderRadius: BORDER_RADIUS.lg, padding: SPACING.base, marginBottom: SPACING.base },
  text: { flex: 1, fontFamily: 'Nunito_600SemiBold', fontSize: FONT_SIZES.base, color: COLORS.earthDark, lineHeight: 20 },
});
```

```tsx
// src/components/feedback/StationReportLink.tsx
import { Pressable, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';

import { COLORS, FONT_SIZES, SPACING } from '../../config/theme';

export function StationReportLink({ stationId }: { stationId: string }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="link"
      style={styles.link}
      onPress={() => router.push({ pathname: '/contacto', params: { kind: 'bug', stationId } })}
    >
      <Text style={styles.text}>¿Ves algo mal en este dato? Avisanos →</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { paddingVertical: SPACING.sm, marginBottom: SPACING.base, alignSelf: 'flex-start' },
  text: { fontFamily: 'Nunito_600SemiBold', fontSize: FONT_SIZES.sm, color: COLORS.river },
});
```

`app/(tabs)/profile.tsx` — add `import { useRouter } from 'expo-router';`, and in `ProfileScreen`, between the header `View` and `<DataSourcesSection />`:

```tsx
      <ContactRow />
```

with, below `ProfileScreen`:

```tsx
function ContactRow() {
  const router = useRouter();
  return (
    <Pressable style={styles.contactRow} onPress={() => router.push('/contacto')} accessibilityRole="button">
      <FontAwesome6 name="comment-dots" size={16} color={COLORS.river} />
      <Text style={styles.contactText}>Contacto y sugerencias</Text>
      <FontAwesome6 name="chevron-right" size={12} color={COLORS.earthLight} />
    </Pressable>
  );
}
```

and in `styles`:

```ts
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
  },
  contactText: {
    flex: 1,
    fontSize: FONT_SIZES.base,
    color: COLORS.earthDark,
    fontFamily: 'Nunito_600SemiBold',
  },
```

`app/(tabs)/index.tsx` — import `{ FeedbackHomeCard } from '../../src/components/feedback/FeedbackHomeCard'` and insert `<FeedbackHomeCard />` after the closing `</Card>` of the "Noticias Prefectura Naval" card, immediately before `</ScrollView>`.

`app/river/[stationId].tsx` — import `{ StationReportLink } from '../../src/components/feedback/StationReportLink'` and insert `<StationReportLink stationId={station.id} />` directly after `<RiverTrend stationId={station.id} />`.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test:components && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/feedback/FeedbackHomeCard.tsx src/components/feedback/StationReportLink.tsx "app/(tabs)/profile.tsx" "app/(tabs)/index.tsx" "app/river/[stationId].tsx" test/FeedbackEntryPoints.test.tsx
git commit -m "feat(app): contact entry points in Perfil, Inicio and each station"
```

---

### Task 9: Push tap opens the thread (cold start included)

**Files:**
- Create: `src/services/notificationRoute.ts`
- Modify: `app/_layout.tsx` (`useNotificationTaps`)
- Test: `test/notificationRoute.test.ts`

**Interfaces:** Consumes: push `data` from the server contract (`{ type: 'feedback_reply', threadId }`, daily `{ screen: 'notifications' }`). Produces: `routeForNotification(data: unknown): string | null`.

- [ ] **Step 1: Write the failing test**

```ts
// test/notificationRoute.test.ts
import { describe, expect, test } from 'vitest';
import { routeForNotification } from '../src/services/notificationRoute';

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('routeForNotification', () => {
  test('opens the thread a reply belongs to', () => {
    expect(routeForNotification({ type: 'feedback_reply', threadId: ID })).toBe(`/contacto/${ID}`);
  });

  test('keeps sending the daily notification to the list', () => {
    expect(routeForNotification({ screen: 'notifications' })).toBe('/notificaciones');
  });

  test.each([
    ['no data', undefined],
    ['null', null],
    ['an unknown type', { type: 'promo', threadId: ID }],
    ['a path instead of an id', { type: 'feedback_reply', threadId: '../../(tabs)' }],
    ['a number id', { type: 'feedback_reply', threadId: 7 }],
  ])('ignores %s', (_label, data) => {
    expect(routeForNotification(data)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/notificationRoute.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Minimal implementation**

```ts
// src/services/notificationRoute.ts
// Where a tapped notification leads. The payload comes from our server, but
// it is still input: only a well-formed thread id becomes part of a route.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function routeForNotification(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as { type?: unknown; threadId?: unknown; screen?: unknown };
  if (d.type === 'feedback_reply') {
    return typeof d.threadId === 'string' && UUID.test(d.threadId) ? `/contacto/${d.threadId}` : null;
  }
  if (d.screen === 'notifications') return '/notificaciones';
  return null;
}
```

`app/_layout.tsx` — add `import { routeForNotification } from '../src/services/notificationRoute';` and replace `useNotificationTaps` with:

```tsx
// A tapped notification says where it leads: the daily one to the list, a
// reply to its thread. Handled at the root so it works whether the app was
// cold, backgrounded, or already open.
function useNotificationTaps(): void {
  const router = useRouter();

  useEffect(() => {
    const open = (data: unknown) => {
      const route = routeForNotification(data);
      if (route) router.push(route);
    };

    // Cold start: the tap that launched the app is waiting here rather than
    // arriving as an event.
    Notifications.getLastNotificationResponseAsync()
      .then((r) => open(r?.notification.request.content.data))
      .catch(() => undefined);

    const tapped = Notifications.addNotificationResponseReceivedListener((r) =>
      open(r.notification.request.content.data),
    );

    // A reply arriving while the app is open refreshes the list and its dot.
    const received = Notifications.addNotificationReceivedListener((n) => {
      if ((n.request.content.data as { type?: unknown } | null)?.type === 'feedback_reply') {
        void queryClient.invalidateQueries({ queryKey: ['feedback'] });
      }
    });

    return () => {
      tapped.remove();
      received.remove();
    };
  }, [router]);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run verify`
Expected: typecheck, vitest and jest all pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/notificationRoute.ts app/_layout.tsx test/notificationRoute.test.ts
git commit -m "feat(app): open the replied thread from a push tap, cold start included"
```

---

### Task 10: Privacy policy (three copies) and Data Safety

**Files:**
- Create: `scripts/update-privacy-policy.mjs`
- Modify: `docs/privacy-policy.html`, `privacy-policy/index.html`, `landing/privacy-policy.html` (via the script)
- Test: `test/privacyPolicy.test.ts`

**Interfaces:** Consumes: server retention (12 months, Task 13 of the server plan), Resend owner email (Task 12). Produces: the published policy at `https://rioparana.com.ar/privacy-policy.html` (served from `landing/`).

- [ ] **Step 1: Write the failing test**

```ts
// test/privacyPolicy.test.ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

// Three copies exist (docs/ for the repo, privacy-policy/ for the old URL,
// landing/ for the one nginx serves). Play reads the served one; all three
// must say the same thing.
const COPIES = ['docs/privacy-policy.html', 'privacy-policy/index.html', 'landing/privacy-policy.html'];
const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe.each(COPIES)('%s', (path) => {
  const html = read(path);

  test('declares the contact messages and what travels with them', () => {
    expect(html).toContain('<strong>Mensajes de contacto:</strong>');
    expect(html).toContain('No pedimos ni guardamos nombre, correo ni teléfono.');
  });

  test('states the 12-month retention', () => {
    expect(html).toContain('se conservan durante 12 meses desde la última actividad de la conversación');
  });

  test('names Resend as the email processor', () => {
    expect(html).toContain('<strong>Resend:</strong>');
  });

  test('explains how to ask for deletion', () => {
    expect(html).toContain('Pedir la eliminación de sus mensajes');
  });

  test('carries the new date', () => {
    expect(html).toContain('Última actualización: 13 de octubre de 2026');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/privacyPolicy.test.ts`
Expected: FAIL — 15 failures, none of the strings exist.

- [ ] **Step 3: Minimal implementation**

```js
// scripts/update-privacy-policy.mjs
// Applies the 2.2.0 policy changes to the three copies identically. Fails
// loudly if an anchor is missing, so a copy that drifted is not half-edited.
import { readFileSync, writeFileSync } from 'node:fs';

const COPIES = ['docs/privacy-policy.html', 'privacy-policy/index.html', 'landing/privacy-policy.html'];

const EDITS = [
  {
    anchor: 'Última actualización: 15 de septiembre de 2026',
    replace: 'Última actualización: 13 de octubre de 2026',
  },
  {
    anchor: 'el token deja de utilizarse.</li>',
    append: '\n            <li><strong>Mensajes de contacto:</strong> Si nos escribe desde "Contacto y sugerencias", guardamos el texto que envía, el tipo de mensaje (sugerencia, error o consulta), la estación sobre la que escribe si la eligió, y la versión de la aplicación y del sistema operativo, asociados al identificador del dispositivo. No pedimos ni guardamos nombre, correo ni teléfono. Usamos estos datos únicamente para leer y responder su mensaje dentro de la aplicación y para corregir errores.</li>',
  },
  {
    anchor: '<li>Enviar la notificación diaria con la altura del río, si la solicitó</li>',
    append: '\n            <li>Leer y responder los mensajes que nos envía desde la aplicación</li>',
  },
  {
    anchor: 'Estos datos se actualizan periódicamente y no contienen información personal.</p>',
    append: '\n        <p>Los mensajes de contacto y sus respuestas se conservan durante 12 meses desde la última actividad de la conversación; pasado ese plazo se eliminan automáticamente.</p>',
  },
  {
    anchor: 'no recibe información sobre la persona usuaria.</li>',
    append: '\n            <li><strong>Resend:</strong> Envía al responsable de la aplicación un aviso por correo cuando llega un mensaje nuevo. El aviso incluye el tipo de mensaje, la estación y los primeros 140 caracteres del texto; no incluye datos que identifiquen a la persona.</li>',
  },
  {
    anchor: '<li>Desactivar las notificaciones desde la configuración de su dispositivo</li>',
    append: '\n            <li>Pedir la eliminación de sus mensajes escribiéndonos desde "Contacto y sugerencias" en la aplicación</li>',
  },
];

for (const path of COPIES) {
  let html = readFileSync(path, 'utf8');
  for (const edit of EDITS) {
    if (!html.includes(edit.anchor)) throw new Error(`${path}: anchor not found: ${edit.anchor}`);
    html = html.replace(edit.anchor, edit.replace ?? edit.anchor + edit.append);
  }
  writeFileSync(path, html);
  console.log(`updated ${path}`);
}
```

Run it once:

```bash
node scripts/update-privacy-policy.mjs
git diff --stat -- docs/privacy-policy.html privacy-policy/index.html landing/privacy-policy.html
```
Expected: three `updated …` lines; each file +5/−1 lines.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run test/privacyPolicy.test.ts && ls -l landing/privacy-policy.html`
Expected: PASS; file mode `-rw-r--r--` (nginx 403s on 600 — see CLAUDE.md pitfall).

- [ ] **Step 5: Commit**

```bash
git add scripts/update-privacy-policy.mjs docs/privacy-policy.html privacy-policy/index.html landing/privacy-policy.html test/privacyPolicy.test.ts
git commit -m "docs(privacy): declare contact messages, Resend notices and 12-month retention"
```

- [ ] **Step 6: Publish the policy (gated) and fill in Data Safety (manual)**

Ask the owner for OK to deploy the landing (`~/.hermes/scripts/deploy-coolify.sh rkg6wbf01f9vxejoogulbt1n --watch` after push). Verify `curl -s https://rioparana.com.ar/privacy-policy.html | rg "12 meses"` prints the retention line.

Then, in Play Console → App content → Data safety → Edit (owner does this; record the answers in the PR description):
- [ ] Data types collected: **Messages → Other in-app messages** — Collected: Yes; Shared: No; Processed ephemerally: No; Required/optional: **Optional** (the user chooses to write); Purposes: **App functionality**.
- [ ] **App info and performance → Diagnostics** (app version, OS version sent with a message) — Collected: Yes; Shared: No; Optional; Purposes: **App functionality**.
- [ ] **Device or other IDs** — already declared for the device id and push token; confirm it stays declared and add "linked to messages" if the form asks.
- [ ] Security practices: data encrypted in transit — **Yes**; users can request deletion — **Yes** (via "Contacto y sugerencias").
- [ ] Resend and Expo are service providers processing on our behalf, which Google does not count as "sharing" — keep Shared = No.
- [ ] Privacy policy URL unchanged: `https://rioparana.com.ar/privacy-policy.html`.
- [ ] Save and submit Data safety **before** submitting the 2.2.0 release.

---

### Task 11: End-to-end loop with Maestro

**Files:**
- Create: `.maestro/feedback-send.yaml`, `.maestro/feedback-reply.yaml`, `scripts/e2e-admin-reply.mjs`, `scripts/e2e-feedback.sh`
- Modify: `package.json` (`"e2e:feedback"` script), `.maestro/README.md` (append a section)

**Interfaces:** Consumes: testIDs `feedback-input`, `feedback-send` (Task 6); thread screen copy (Task 7); push copy and admin routes from the server plan (`/admin/login`, `/admin?filter=pending`, `/admin/threads/:id/reply`, `/admin/threads/:id/archive`, inbox `<li>` markup). Produces: `npm run e2e:feedback`.

- [ ] **Step 1: Write the failing flow**

```yaml
# .maestro/feedback-send.yaml
# Send a message from Perfil and land on its thread. MARKER makes the thread
# findable from the admin and keeps runs apart.
appId: com.syloper.rioparanaapp
---
- launchApp:
    clearState: true
    permissions:
      all: allow

- retry:
    maxRetries: 3
    commands:
      - runFlow: dismiss-location.yaml
      - extendedWaitUntil:
          visible: "Estaciones"
          timeout: 30000

- assertNotVisible: "DEVELOPMENT SERVERS"

- tapOn: "Perfil"
- tapOn: "Contacto y sugerencias"
- tapOn: "Consulta"
- tapOn:
    id: "feedback-input"
- inputText: "e2e ${MARKER}"
- hideKeyboard
- tapOn:
    id: "feedback-send"

# The thread screen shows the message we just sent, signed as ours.
- extendedWaitUntil:
    visible: "e2e ${MARKER}"
    timeout: 20000
- assertVisible: "Vos"

# Background the app so the reply push lands in the notification shade.
- pressKey: Home
```

```yaml
# .maestro/feedback-reply.yaml
# After the admin replied: open the push from the shade and read the reply.
appId: com.syloper.rioparanaapp
---
- swipe:
    start: "50%, 1%"
    end: "50%, 70%"
- extendedWaitUntil:
    visible: "Tenés una respuesta a tu mensaje"
    timeout: 120000
- tapOn: "Tenés una respuesta a tu mensaje"

- extendedWaitUntil:
    visible: "e2e-reply ${MARKER}"
    timeout: 30000
- assertVisible: "Paraná Info"
# The push itself never carried the reply text; it arrived from the API.
```

- [ ] **Step 2: Run it to verify it fails**

Build and install the **release** variant on a booted emulator (see `.maestro/README.md`), then:

Run: `maestro --platform android test -e MARKER=probe .maestro/feedback-send.yaml`
Expected (before Tasks 6–8 are installed in the build under test): FAIL at `tapOn: "Contacto y sugerencias"`. Against a build containing Tasks 1–9 it must PASS — that is the green state for this step.

- [ ] **Step 3: Minimal implementation**

```js
// scripts/e2e-admin-reply.mjs
// Plays the owner: logs into the tailnet admin, finds the thread carrying
// MARKER, replies, then archives it so e2e runs do not pile up in the inbox.
// Needs ADMIN_PASSWORD and MARKER; ADMIN_URL defaults to the tailnet address.
const base = process.env.ADMIN_URL ?? 'http://100.89.213.31:3100';
const password = process.env.ADMIN_PASSWORD;
const marker = process.env.MARKER;
if (!password || !marker) {
  console.error('ADMIN_PASSWORD and MARKER are required');
  process.exit(1);
}

const jar = new Map();
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
function remember(res) {
  for (const raw of res.headers.getSetCookie()) {
    const [pair] = raw.split(';');
    const i = pair.indexOf('=');
    const name = pair.slice(0, i);
    const value = pair.slice(i + 1);
    if (value) jar.set(name, value);
    else jar.delete(name);
  }
}
const csrf = (html) => {
  const m = /name="_csrf" value="([^"]+)"/.exec(html);
  if (!m) throw new Error('no csrf field');
  return m[1];
};

async function get(path) {
  const res = await fetch(base + path, { headers: { cookie: cookie() }, redirect: 'manual' });
  remember(res);
  if (res.status !== 200) throw new Error(`GET ${path} → ${res.status}`);
  return res.text();
}

async function post(path, fields) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { cookie: cookie(), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
    redirect: 'manual',
  });
  remember(res);
  if (res.status !== 303) throw new Error(`POST ${path} → ${res.status}`);
}

await post('/admin/login', { password, _csrf: csrf(await get('/admin/login')) });

let threadId;
for (let attempt = 0; attempt < 12 && !threadId; attempt++) {
  const inbox = await get('/admin?filter=pending');
  const item = inbox.split('<li>').find((chunk) => chunk.includes(`e2e ${marker}`));
  threadId = item && /href="\/admin\/threads\/([0-9a-f-]{36})"/.exec(item)?.[1];
  if (!threadId) await new Promise((r) => setTimeout(r, 5000));
}
if (!threadId) throw new Error(`no pending thread with marker ${marker}`);

await post(`/admin/threads/${threadId}/reply`, { _csrf: csrf(await get(`/admin/threads/${threadId}`)), body: `e2e-reply ${marker}` });
await post(`/admin/threads/${threadId}/archive`, { _csrf: csrf(await get(`/admin/threads/${threadId}`)) });
console.log(`replied to and archived ${threadId}`);
```

```bash
#!/usr/bin/env bash
# scripts/e2e-feedback.sh — send from the app, reply as the owner, open the push.
# Run from a machine on the tailnet, against a RELEASE build on a booted emulator.
set -euo pipefail
: "${ADMIN_PASSWORD:?export ADMIN_PASSWORD (the admin password, not the hash)}"
MARKER="$(date +%s)"
export MARKER

maestro --platform android test -e MARKER="$MARKER" .maestro/feedback-send.yaml
node scripts/e2e-admin-reply.mjs
maestro --platform android test -e MARKER="$MARKER" .maestro/feedback-reply.yaml
echo "feedback e2e passed (marker $MARKER)"
```

```bash
chmod +x scripts/e2e-feedback.sh
```

`package.json` — add to `scripts`:

```json
    "e2e:feedback": "bash scripts/e2e-feedback.sh",
```

Append to `.maestro/README.md`:

```markdown
## Feedback loop (`npm run e2e:feedback`)

Sends a message from Perfil → Contacto y sugerencias, replies to it from the
tailnet admin (`scripts/e2e-admin-reply.mjs`), then opens the reply push from
the notification shade and checks the reply text in the thread.

Needs: a release build of 2.2.0+ on an emulator **with Google Play services**
(push goes through FCM), the production API (server plan Rollout step 2 done),
this machine on the tailnet, and `ADMIN_PASSWORD` exported. The thread is
archived at the end. The owner gets one "Paraná Info: 1 mensaje(s) nuevo(s)"
email per run — expected.
```

- [ ] **Step 4: Run tests to verify pass**

Run: `ADMIN_PASSWORD=… npm run e2e:feedback`
Expected: both flows pass and the script prints `feedback e2e passed (marker …)`; the admin shows the thread under Archivados with the reply.

- [ ] **Step 5: Commit**

```bash
git add .maestro/feedback-send.yaml .maestro/feedback-reply.yaml .maestro/README.md scripts/e2e-admin-reply.mjs scripts/e2e-feedback.sh package.json
git commit -m "test(e2e): send, owner reply and push-to-thread loop with maestro"
```

---

### Task 12: Version 2.2.0, build and submit (gated)

**Files:**
- Modify: `app.json` (`expo.version`)

**Interfaces:** Consumes: everything above; server plan Rollout step 2 verified. Produces: a 2.2.0 AAB in Play's production track.

- [ ] **Step 1: Write the failing check**

Run: `node -e "const v=require('./app.json').expo.version; if (v!=='2.2.0') { console.error('version is '+v); process.exit(1) }"`
Expected: FAIL — `version is 2.1.0`.

- [ ] **Step 2: Bump the version**

In `app.json`, change `"version": "2.1.0"` to `"version": "2.2.0"`. Re-run the check from Step 1 → exits 0.

- [ ] **Step 3: Reconcile the versionCode counters**

EAS keeps its own Android versionCode (`appVersionSource: remote`, `autoIncrement: true`), and it has drifted from Play before.
- [ ] Play Console → Release → App bundle explorer: note the highest versionCode ever uploaded (call it P).
- [ ] `npx eas-cli build:version:get -p android` → note E.
- [ ] If E < P: `npx eas-cli build:version:set -p android` and enter P (autoIncrement makes the next build P + 1).

- [ ] **Step 4: Verify, build (gated) and test the release**

Run: `npm run verify`
Expected: typecheck, vitest and jest all green.

Ask the owner for OK to build, then: `npx eas-cli build -p android --profile production`. Install the produced AAB's universal APK on the emulator (`bundletool` or the EAS internal link) and run `ADMIN_PASSWORD=… npm run e2e:feedback` and `npm run e2e` (the existing river flow). Both must pass.

Manual checks on a real Android phone with the release build:
- [ ] Cold start with airplane mode on: the app opens normally; Inicio, a station and Perfil render; no error toast.
- [ ] Turn the network back on, open Contacto y sugerencias, send a message; it appears in Mis mensajes.
- [ ] Reply from the admin with the app killed; tap the push; the thread opens with the reply (cold start).
- [ ] The same with the app in the background.

- [ ] **Step 5: Commit, then submit (gated)**

```bash
git add app.json
git commit -m "chore(release): 2.2.0 with in-app contact and replies"
```

Only after Task 10 Step 6 (policy live + Data safety saved) and the owner's OK: `npx eas-cli submit -p android --profile production`. Release notes (es-AR, owner to approve the wording): `Ahora podés escribirnos desde la app: contanos ideas, avisanos si ves un dato mal o hacé una consulta, y leé nuestra respuesta acá mismo.`

---

## Rollout

1. **Server first.** Server plan Rollout steps 1 and 2 done and verified (tokens, `/me/*`, feedback API, owner email, tailnet admin). The app must not ship against a server without `/devices/register`: every `/me/*` call would fail and pings would stop.
2. **Compliance.** Policy deployed with the landing (Task 10 Step 6, gated) and Data safety saved.
3. **App 2.2.0 to Play** (Task 12, gated): staged rollout at 20 % for 48 h. Watch `GET /stats` → `auth.activeWithToken` rising and Coolify logs for 401 `invalid_token` spikes; then 100 %.
4. **Sunset legacy routes** — server plan Rollout step 4, once `auth.shareOfActive` ≥ 0.9 for 7 days. 2.1.x installs then lose ping/push-token/notification history; their river data keeps working.

## Spec Coverage

| Spec item (Phase 3 and app-side testing) | Task |
|---|---|
| Registration on startup, never blocks, retry later | 1, 4 (and lazy retry in 2) |
| Bearer on every device-scoped request; `/me/*` migration | 2, 3 |
| Screen "Contacto y sugerencias" (chips, text, station chip, Send, privacy line, Mis mensajes, pills, unread dot) | 5, 6 |
| Thread screen (bubbles, "Paraná Info", reply box) | 7 |
| Entry points: Perfil row, station link (Error + station), Inicio card | 8 |
| Push tap `feedback_reply` opens the thread, cold start | 9 |
| Data Safety + privacy policy with 12-month retention | 10 (purge job: server plan Task 13) |
| Error handling: failed send keeps text and offers retry; nothing throws on start | 3, 4, 6, 7 |
| Component tests for screens and entry points; deep link handling | 4, 6, 7, 8, 9 |
| End to end (Maestro): send → admin reply → open push → see reply | 11 |
| Release 2.2.0 | 12 |

## Spec gaps resolved here

- Copy the spec does not fix (placeholders, status pill labels, failure messages, thread title, `Vos`) is defined in the Copy table above; flag any change to the owner before release.
- The spec names `docs/privacy-policy.html`, but three synced copies exist and Play reads `landing/privacy-policy.html`; Task 10 updates all three with one script and a test that keeps them aligned.
- The spec does not say what happens when a token stops working. The app re-registers once on `invalid_token` (server plan deviation: distinct from the API-key 401), and rotates its deviceId once on 409.
- The privacy policy adds Resend as a processor: the owner email carries the first 140 characters of a message, which the spec's Data Safety line did not mention.
