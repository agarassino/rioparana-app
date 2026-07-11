# Railway Backend Migration + Anonymous Device Analytics — Design

**Date:** 2026-07-10
**Status:** Implemented and merged to `main`. Host changed to **Render** after implementation.
**Project:** rioparana-app (Expo / React Native, TypeScript)

> **Update (post-implementation):** Deployment target switched from Railway to **Render**.
> Because Render free web services sleep after ~15 min of inactivity (which would stop an
> in-process `node-cron`), the topology changed from "single service + in-process cron" to
> **two services**: a web service (the API) and a separate **Render Cron Job** (`npm run refresh`
> → `src/refresh-once.ts`) that scrapes every 15 min. `node-cron` was removed. `createPool` now
> enables SSL for Render Postgres. Config lives in `server/render.yaml`; see `server/README.md`.
> Caveats: Render cron jobs are a paid plan (no free tier); free Postgres expires ~30 days.

## Problem & Motivation

Today the mobile app talks directly to third-party sources and to a Supabase
project used purely as a cache/fallback layer:

- River level: client scrapes Prefectura Naval (`riverApi.ts`)
- News: client scrapes `argentina.gob.ar` (`newsApi.ts`)
- Weather: client calls Open-Meteo directly (`weatherApi.ts`)
- Supabase (`supabase.ts`) stores/reads cache in three tables:
  `water_levels`, `news_cache`, `weather_cache`

Two concrete problems drive this change:

1. **Security / control.** The Supabase URL and anon key are hardcoded in
   `src/services/supabase.ts` and therefore shipped inside the APK/AAB. Client
   code performs privileged writes with that key — notably
   `supabase.from('news_cache').delete().neq('news_id', '')` in `newsApi.ts`,
   which deletes all news rows. If Row Level Security is not locked down, anyone
   who extracts the anon key can wipe or poison the cache.
2. **No visibility into usage.** There is no login and no analytics, so there is
   no way to know how many devices use the app or which stations matter.

Plus a stated preference to **consolidate infrastructure on Railway**.

## Goals

- Move the datastore off Supabase onto Railway (managed Postgres).
- Introduce a small backend so the app no longer holds DB credentials or scraping
  logic — the client only calls our API.
- Capture anonymous, login-less device analytics: active devices and per-station
  usage.

## Non-Goals

- No user accounts / login.
- No data migration from Supabase (cache tables are regenerable; device data
  starts fresh).
- No RevenueCat / IAP changes (tracked separately).
- Not bundled with the in-flight Play "misleading claims" compliance release.

## Architecture

Single Railway service (Node + TypeScript, Fastify) plus a managed Postgres
instance. Scheduled scraping runs in-process via `node-cron`.

```
                     Railway
   ┌────────────────────────────────────────┐
   │  API service (Node + TS, Fastify)       │
   │   ├─ GET  /health                       │
   │   ├─ GET  /river/:stationId             │
   │   ├─ GET  /news                         │
   │   ├─ GET  /weather?lat=&lon=            │
   │   ├─ POST /devices/ping                 │
   │   └─ node-cron (~15 min):               │
   │        scrape PNA + scrape gob.ar       │
   │   ┌───────────────┐                     │
   │   │  Postgres      │  (Railway managed) │
   │   └───────────────┘                     │
   └────────────────────────────────────────┘
          ▲
          │ HTTPS + x-api-key
   ┌──────┴───────┐
   │  App (Expo)   │  no scraping, no direct DB access
   └──────────────┘
```

**Topology decision:** one service with in-process `node-cron` (Option A), chosen
over a separate cron service (Option B) for simplicity and cost. Revisit if the
cron load starts to affect API latency.

**Two data-refresh models:**

- **River + news = cron-refreshed.** Fixed, known sets (a static station list and
  a single news feed). Refreshed every ~15 min; the app just reads the latest.
- **Weather = on-demand caching proxy.** Weather is per-coordinate and cannot be
  pre-fetched for the whole country. `GET /weather` caches by rounded coordinate
  with a TTL (~30 min): serve fresh from DB, otherwise call Open-Meteo, store,
  and return. Nearby users share the upstream call.

## Data Model (Postgres)

```
water_levels
  station_id     text PK
  level          numeric
  trend          text            -- rising | falling | stable
  change_rate    numeric
  timestamp      timestamptz     -- measurement time from PNA
  updated_at     timestamptz     -- last successful cron refresh

news
  id             text PK         -- news path (natural dedup key)
  title          text
  date           text
  url            text
  fetched_at     timestamptz

weather_cache
  lat_bucket     numeric         }
  lon_bucket     numeric         }  composite PK (rounded ~1km)
  data           jsonb           -- serialized LocationWeather
  fetched_at     timestamptz

devices
  device_id      uuid PK         -- generated on the device
  first_seen     timestamptz
  last_seen      timestamptz

device_station_views
  device_id      uuid            }
  station_id     text            }  composite PK
  view_count     integer
  last_viewed_at timestamptz
```

`device_station_views` is aggregated (one counter per device+station), not an
event log, so it stays bounded. "Favorite station" is `ORDER BY view_count`.

## API

| Method | Route | Behavior |
|--------|-------|----------|
| `GET`  | `/health` | Railway healthcheck |
| `GET`  | `/river/:stationId` | latest level for the station (includes `updatedAt`) |
| `GET`  | `/news` | latest news list |
| `GET`  | `/weather?lat=&lon=` | cached/proxied weather by coordinate |
| `POST` | `/devices/ping` | body `{deviceId, stationId?}` → upsert device (first/last seen) + increment station view |

- All routes require an `x-api-key` header (a low-value app key, extractable but
  filters casual abuse) plus per-IP rate limiting.
- Clients have **no write access** to river/news/weather. That logic lives only
  in the cron. The current risk (client-side `delete()` on the cache) is
  eliminated by construction.
- `/devices/ping` is the single tracking endpoint: called on app open (heartbeat
  → `last_seen`) and on station view (with `stationId`). Must be idempotent.
- **Response types mirror the existing app types exactly** (`WaterLevel`,
  `NewsItem`, `LocationWeather`) so hooks and UI are unchanged.

## Error Handling & Degradation

Migrating removes Supabase as the fallback, so resilience must be restored on
both sides.

**Backend — never serve empty:**

- If a PNA/news scrape fails, the cron does **not** overwrite good data with
  empty. It keeps the last value; `updated_at` signals staleness.
- `/weather`: if Open-Meteo fails and stale cache exists, return the stale cache
  (flagged) rather than an error.

**App — local cache:**

- Persist the last successful response per endpoint in `AsyncStorage`. If the
  backend is unreachable, show the last known value (the role Supabase played
  before, now local). Graceful degradation instead of "no data".
- Emergency call (106) and the source links do **not** depend on the backend and
  always work — important for a nautical app.

## App Changes

| File | Change |
|------|--------|
| `src/services/supabase.ts` | **removed** (and the hardcoded credentials with it) |
| `src/services/api/riverApi.ts` | drop scraping + Supabase → `GET /river/:id`; keep `WaterLevel` |
| `src/services/api/newsApi.ts` | drop scraping + Supabase → `GET /news`; keep `NewsItem` |
| `src/services/api/weatherApi.ts` | drop direct Open-Meteo → `GET /weather`; keep `LocationWeather` |
| `src/services/api/client.ts` | **new** — HTTP client: base URL + `x-api-key` + AsyncStorage local cache |
| `src/services/device.ts` | **new** — generate/persist `deviceId`, fire `/devices/ping` on open and on station view |
| hooks & UI | **unchanged** (types preserved) |

Existing parsing logic (`parseWaterLevel`, `parseHtmlToNews`) is **moved to the
backend**, not rewritten.

Base URL is provided as `EXPO_PUBLIC_API_URL` and set as a real **EAS environment
variable** (not only in `.env.local`) so production builds pick it up.

## Privacy & Play Compliance

Collecting device ID + usage triggers Play obligations:

- **Data Safety form:** declare collection of *Device or other IDs* (anonymous)
  and *App activity* (station views), purpose = Analytics, **not shared**, **not
  linked to identity**.
- **Privacy policy** (existing GitHub Pages page): add a section describing what
  is collected, why, that it is anonymous, retention, and no PII / no sale.
- **Release sequencing:** do **not** bundle this with the in-flight "misleading
  claims" compliance build (versionCode 5). Let that be approved first, then ship
  the migration as a separate release, to avoid a fresh Data Safety mismatch
  rejection.

## Testing

- **Backend:** unit tests for the parsers (moved from the app, currently
  untested), weather TTL/cache logic, endpoint integration tests (supertest +
  test Postgres), `/devices/ping` upsert idempotency.
- **App:** mock the HTTP client; test the fallback-to-local-cache path when the
  backend is unreachable.

## Rollout / Cutover

1. Stand up backend + Postgres on Railway; deploy; verify cron populates data and
   endpoints respond.
2. EAS internal build pointing at Railway; test end-to-end on device/emulator.
3. Keep Supabase running throughout the transition.
4. Production build pointing at Railway; release.
5. After production is confirmed healthy, decommission Supabase.

No data migration required.

## Open Questions / Future Work

- Separate cron into its own Railway job if scraping load grows (Option B).
- Automated DB backups / retention policy on Railway Postgres.
- Optional richer analytics (platform, OS/app version, region) later — each
  addition must be reflected in the Data Safety form and privacy policy.
