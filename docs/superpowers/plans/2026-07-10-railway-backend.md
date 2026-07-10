# Railway Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a small Node+TypeScript backend on Railway that scrapes river/news data on a schedule, proxies weather with a cache, records anonymous device analytics, and exposes a read API to the app — replacing the app's direct scraping and its Supabase cache layer.

**Architecture:** A single Fastify service backed by Railway-managed Postgres. River and news are refreshed by an in-process `node-cron` job (~15 min); weather is an on-demand caching proxy (TTL ~30 min). The app (Plan 2) will consume this API and never touch the DB or scrape.

**Tech Stack:** Node 20+, TypeScript, Fastify 4, `pg` (node-postgres), `node-cron`, `@fastify/rate-limit`, `zod`. Tests: `vitest` + `pg-mem` (in-memory Postgres, no Docker needed) + injected `fetch` stubs.

## Global Constraints

- Backend lives in a new `server/` subdirectory with its own `package.json`; Railway "Root Directory" = `server`.
- All HTTP routes except `/health` require header `x-api-key` equal to env `APP_API_KEY`.
- Every route is behind per-IP rate limiting.
- Clients have **no write path** to river/news/weather; only the cron writes those.
- API JSON response shapes mirror the app types (`WaterLevel`, `NewsItem`, `LocationWeather`), with `Date` fields serialized as ISO 8601 strings.
- Cron refresh interval: every 15 minutes. Weather cache TTL: 30 minutes. Weather coordinate bucket: round lat/lon to 2 decimals (~1 km).
- A failed scrape must never overwrite good data with empty.
- Station set is fixed (10 stations, copied verbatim in Task 2).
- No data migration from Supabase.

---

### Task 1: Project scaffold + Fastify bootstrap + `/health`

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/vitest.config.ts`
- Create: `server/.gitignore`
- Create: `server/src/server.ts`
- Test: `server/test/health.test.ts`

**Interfaces:**
- Produces: `buildServer(): FastifyInstance` in `server/src/server.ts` — a Fastify app with `GET /health` returning `{ status: 'ok' }`. Later tasks register more routes onto the instance this returns.

- [ ] **Step 1: Create `server/package.json`**

```json
{
  "name": "rioparana-server",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@fastify/rate-limit": "^9.1.0",
    "fastify": "^4.28.1",
    "node-cron": "^3.0.3",
    "pg": "^8.12.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/node-cron": "^3.0.11",
    "@types/pg": "^8.11.6",
    "pg-mem": "^3.0.3",
    "tsx": "^4.16.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `server/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
```

- [ ] **Step 4: Create `server/.gitignore`**

```
node_modules/
dist/
.env
```

- [ ] **Step 5: Install dependencies**

Run: `cd server && npm install`
Expected: `node_modules/` created, no errors.

- [ ] **Step 6: Write the failing test** — `server/test/health.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { buildServer } from '../src/server.js';

describe('GET /health', () => {
  it('returns ok', async () => {
    const app = buildServer();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    await app.close();
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd server && npm test`
Expected: FAIL — cannot resolve `../src/server.js`.

- [ ] **Step 8: Write minimal implementation** — `server/src/server.ts`

```ts
import Fastify, { FastifyInstance } from 'fastify';

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get('/health', async () => ({ status: 'ok' }));
  return app;
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd server && npm test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add server/package.json server/package-lock.json server/tsconfig.json server/vitest.config.ts server/.gitignore server/src/server.ts server/test/health.test.ts
git commit -m "feat(server): scaffold Fastify backend with health route"
```

---

### Task 2: Config + station list + shared types

**Files:**
- Create: `server/src/types.ts`
- Create: `server/src/config/stations.ts`
- Create: `server/src/config/env.ts`
- Create: `server/.env.example`
- Test: `server/test/env.test.ts`

**Interfaces:**
- Produces:
  - `server/src/types.ts` exports `Trend`, `WaterLevel`, `StoredWaterLevel`, `NewsItem`, `CurrentWeather`, `WeatherForecast`, `LocationWeather`, `Station` (shapes below).
  - `server/src/config/stations.ts` exports `STATIONS: Station[]` and `getStationById(id: string): Station | undefined`.
  - `server/src/config/env.ts` exports `loadEnv(source?: Record<string,string|undefined>): Env` where `Env = { port: number; databaseUrl: string; apiKey: string }`.

- [ ] **Step 1: Create shared types** — `server/src/types.ts`

```ts
export type Trend = 'rising' | 'falling' | 'stable';

export interface WaterLevel {
  stationId: string;
  level: number;
  trend: Trend;
  changeRate: number;
  timestamp: string; // ISO 8601
}

export interface StoredWaterLevel extends WaterLevel {
  updatedAt: string; // ISO 8601
}

export interface NewsItem {
  id: string;
  title: string;
  date: string;
  url: string;
}

export interface CurrentWeather {
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  windDirection: string;
  description: string;
  icon: string;
  timestamp: string; // ISO 8601
}

export interface WeatherForecast {
  date: string; // ISO 8601
  tempMax: number;
  tempMin: number;
  description: string;
  icon: string;
  precipProbability: number;
}

export interface LocationWeather {
  latitude: number;
  longitude: number;
  current: CurrentWeather;
  daily: WeatherForecast[];
}

export interface Station {
  id: string;
  name: string;
  code: string;
  latitude: number;
  longitude: number;
  province: string;
}
```

- [ ] **Step 2: Create station list** — `server/src/config/stations.ts`

```ts
import { Station } from '../types.js';

// Copied verbatim from the app (src/config/stations.ts). PNA station codes.
export const STATIONS: Station[] = [
  { id: 'corrientes', name: 'Corrientes', code: '130', latitude: -27.4667, longitude: -58.8333, province: 'Corrientes' },
  { id: 'barranqueras', name: 'Barranqueras', code: '140', latitude: -27.4833, longitude: -58.9333, province: 'Chaco' },
  { id: 'goya', name: 'Goya', code: '170', latitude: -29.1333, longitude: -59.2667, province: 'Corrientes' },
  { id: 'reconquista', name: 'Reconquista', code: '180', latitude: -29.15, longitude: -59.65, province: 'Santa Fe' },
  { id: 'santa-fe', name: 'Santa Fe', code: '240', latitude: -31.6333, longitude: -60.7, province: 'Santa Fe' },
  { id: 'parana', name: 'Paraná', code: '230', latitude: -31.7333, longitude: -60.5167, province: 'Entre Ríos' },
  { id: 'rosario', name: 'Rosario', code: '280', latitude: -32.95, longitude: -60.65, province: 'Santa Fe' },
  { id: 'san-nicolas', name: 'San Nicolás', code: '300', latitude: -33.3333, longitude: -60.2167, province: 'Buenos Aires' },
  { id: 'villa-constitucion', name: 'Villa Constitución', code: '290', latitude: -33.2333, longitude: -60.3333, province: 'Santa Fe' },
  { id: 'san-lorenzo', name: 'San Lorenzo', code: '270', latitude: -32.75, longitude: -60.7333, province: 'Santa Fe' },
];

export function getStationById(id: string): Station | undefined {
  return STATIONS.find((s) => s.id === id);
}
```

- [ ] **Step 3: Create `.env.example`** — `server/.env.example`

```
PORT=3000
DATABASE_URL=postgresql://user:pass@host:5432/railway
APP_API_KEY=replace-with-a-long-random-string
```

- [ ] **Step 4: Write the failing test** — `server/test/env.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { loadEnv } from '../src/config/env.js';

describe('loadEnv', () => {
  it('parses valid env', () => {
    const env = loadEnv({ PORT: '4000', DATABASE_URL: 'postgres://x', APP_API_KEY: 'secret' });
    expect(env).toEqual({ port: 4000, databaseUrl: 'postgres://x', apiKey: 'secret' });
  });

  it('defaults port to 3000', () => {
    const env = loadEnv({ DATABASE_URL: 'postgres://x', APP_API_KEY: 'secret' });
    expect(env.port).toBe(3000);
  });

  it('throws when DATABASE_URL missing', () => {
    expect(() => loadEnv({ APP_API_KEY: 'secret' })).toThrow();
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd server && npm test env`
Expected: FAIL — cannot resolve `../src/config/env.js`.

- [ ] **Step 6: Write minimal implementation** — `server/src/config/env.ts`

```ts
import { z } from 'zod';

const schema = z.object({
  PORT: z.string().regex(/^\d+$/).optional(),
  DATABASE_URL: z.string().min(1),
  APP_API_KEY: z.string().min(1),
});

export interface Env {
  port: number;
  databaseUrl: string;
  apiKey: string;
}

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.parse(source);
  return {
    port: parsed.PORT ? Number(parsed.PORT) : 3000,
    databaseUrl: parsed.DATABASE_URL,
    apiKey: parsed.APP_API_KEY,
  };
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd server && npm test env`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add server/src/types.ts server/src/config/stations.ts server/src/config/env.ts server/.env.example server/test/env.test.ts
git commit -m "feat(server): add shared types, station list, and env config"
```

---

### Task 3: River scraper (parse + fetch)

**Files:**
- Create: `server/src/scrapers/river.ts`
- Test: `server/test/scrapers/river.test.ts`

**Interfaces:**
- Consumes: `Station` from `types.ts`, `WaterLevel`, `Trend`.
- Produces:
  - `parseWaterLevel(html: string, stationId: string): WaterLevel | null`
  - `buildRiverUrl(code: string): string`
  - `fetchWaterLevel(station: Station, fetchFn?: typeof fetch): Promise<WaterLevel | null>`

- [ ] **Step 1: Write the failing test** — `server/test/scrapers/river.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { parseWaterLevel, buildRiverUrl } from '../../src/scrapers/river.js';

const HTML = `
<table>
<tr><td><i class="fa fa-calendar"></i> 2026-01-16 <i class="fa fa-clock-o"></i> 00:00</td><td>2.77 Mts</td></tr>
<tr><td><i class="fa fa-calendar"></i> 2026-01-15 <i class="fa fa-clock-o"></i> 00:00</td><td>2.50 Mts</td></tr>
</table>`;

describe('parseWaterLevel', () => {
  it('extracts latest level and rising trend', () => {
    const wl = parseWaterLevel(HTML, 'parana');
    expect(wl?.level).toBe(2.77);
    expect(wl?.trend).toBe('rising');
    expect(wl?.stationId).toBe('parana');
    expect(typeof wl?.timestamp).toBe('string');
  });

  it('returns null when no rows', () => {
    expect(parseWaterLevel('<table></table>', 'parana')).toBeNull();
  });
});

describe('buildRiverUrl', () => {
  it('builds the historico URL with the station code', () => {
    expect(buildRiverUrl('230')).toBe(
      'https://contenidosweb.prefecturanaval.gob.ar/alturas/?page=historico&tiempo=7&id=230'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test river`
Expected: FAIL — cannot resolve `../../src/scrapers/river.js`.

- [ ] **Step 3: Write minimal implementation** — `server/src/scrapers/river.ts`

```ts
import { Station, WaterLevel, Trend } from '../types.js';

const PNA_BASE_URL = 'https://contenidosweb.prefecturanaval.gob.ar/alturas';

export function buildRiverUrl(code: string): string {
  return `${PNA_BASE_URL}/?page=historico&tiempo=7&id=${code}`;
}

export function parseWaterLevel(html: string, stationId: string): WaterLevel | null {
  const datePattern =
    /<td[^>]*><i[^>]*><\/i>\s*(\d{4}-\d{2}-\d{2})\s*<i[^>]*><\/i>\s*(\d{2}:\d{2})<\/td>/gi;
  const levelPattern = /<td[^>]*>(\d+\.?\d*)\s*Mts<\/td>/gi;

  const dates: { date: string; time: string }[] = [];
  const levels: number[] = [];

  let dm: RegExpExecArray | null;
  while ((dm = datePattern.exec(html)) !== null) dates.push({ date: dm[1], time: dm[2] });
  let lm: RegExpExecArray | null;
  while ((lm = levelPattern.exec(html)) !== null) levels.push(parseFloat(lm[1]));

  if (dates.length === 0 || levels.length === 0) return null;

  const currentLevel = levels[0];
  const timestamp = new Date(`${dates[0].date}T${dates[0].time}:00`).toISOString();

  let trend: Trend = 'stable';
  let changeRate = 0;
  if (levels.length > 1) {
    const diff = currentLevel - levels[1];
    changeRate = diff * 100;
    if (diff > 0.02) trend = 'rising';
    else if (diff < -0.02) trend = 'falling';
  }

  return { stationId, level: currentLevel, trend, changeRate, timestamp };
}

export async function fetchWaterLevel(
  station: Station,
  fetchFn: typeof fetch = fetch
): Promise<WaterLevel | null> {
  const res = await fetchFn(buildRiverUrl(station.code), {
    headers: { Accept: 'text/html', 'User-Agent': 'ParanaInfo-Server/1.0' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return parseWaterLevel(html, station.id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test river`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/scrapers/river.ts server/test/scrapers/river.test.ts
git commit -m "feat(server): add river level scraper"
```

---

### Task 4: News scraper (parse + fetch)

**Files:**
- Create: `server/src/scrapers/news.ts`
- Test: `server/test/scrapers/news.test.ts`

**Interfaces:**
- Consumes: `NewsItem` from `types.ts`.
- Produces:
  - `parseNews(html: string): NewsItem[]`
  - `fetchNews(fetchFn?: typeof fetch): Promise<NewsItem[]>`
  - `NEWS_URL: string`

- [ ] **Step 1: Write the failing test** — `server/test/scrapers/news.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { parseNews } from '../../src/scrapers/news.js';

const HTML = `
<a href="/noticias/prefectura-aniversario" class="panel panel-default">
  <time>09 de julio de 2026</time>
  <h3>Prefectura conmemor&oacute; el aniversario</h3>
</a>
<a href="/noticias/otra-noticia" class="panel">
  <time>08 de julio de 2026</time>
  <h3>Segunda noticia</h3>
</a>`;

describe('parseNews', () => {
  it('parses items with decoded titles and absolute urls', () => {
    const items = parseNews(HTML);
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe('/noticias/prefectura-aniversario');
    expect(items[0].title).toBe('Prefectura conmemoró el aniversario');
    expect(items[0].url).toBe('https://www.argentina.gob.ar/noticias/prefectura-aniversario');
  });

  it('returns empty array for no matches', () => {
    expect(parseNews('<div>nada</div>')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test news`
Expected: FAIL — cannot resolve `../../src/scrapers/news.js`.

- [ ] **Step 3: Write minimal implementation** — `server/src/scrapers/news.ts`

```ts
import { NewsItem } from '../types.js';

export const NEWS_URL = 'https://www.argentina.gob.ar/prefecturanaval/noticias-pna';

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&oacute;/g, 'ó')
    .replace(/&aacute;/g, 'á')
    .replace(/&eacute;/g, 'é')
    .replace(/&iacute;/g, 'í')
    .replace(/&uacute;/g, 'ú')
    .replace(/&ntilde;/g, 'ñ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseNews(html: string): NewsItem[] {
  const news: NewsItem[] = [];
  const seen = new Set<string>();
  const pattern =
    /<a[^>]*href="(\/noticias\/[^"]+)"[^>]*class="panel[^"]*"[^>]*>[\s\S]*?<time[^>]*>([^<]*)<\/time>[\s\S]*?<h3>([^<]+)<\/h3>[\s\S]*?<\/a>/gi;

  let m: RegExpExecArray | null;
  while ((m = pattern.exec(html)) !== null && news.length < 10) {
    const url = m[1];
    const date = m[2].trim();
    const title = m[3].trim();
    if (seen.has(url) || !title) continue;
    seen.add(url);
    news.push({
      id: url,
      title: decodeHtmlEntities(title),
      date,
      url: `https://www.argentina.gob.ar${url}`,
    });
  }
  return news;
}

export async function fetchNews(fetchFn: typeof fetch = fetch): Promise<NewsItem[]> {
  const res = await fetchFn(NEWS_URL, {
    headers: { Accept: 'text/html', 'User-Agent': 'ParanaInfo-Server/1.0' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseNews(await res.text());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test news`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/scrapers/news.ts server/test/scrapers/news.test.ts
git commit -m "feat(server): add news scraper"
```

---

### Task 5: Database pool + schema + migrations

**Files:**
- Create: `server/src/db/schema.sql`
- Create: `server/src/db/index.ts`
- Test: `server/test/db.test.ts`

**Interfaces:**
- Produces:
  - `SCHEMA_SQL: string` (the DDL, exported for reuse in tests)
  - `createPool(databaseUrl: string): Pool`
  - `runMigrations(pool: Pool): Promise<void>` — executes `SCHEMA_SQL` (idempotent, uses `IF NOT EXISTS`).

- [ ] **Step 1: Create schema** — `server/src/db/schema.sql`

```sql
CREATE TABLE IF NOT EXISTS water_levels (
  station_id  text PRIMARY KEY,
  level       numeric NOT NULL,
  trend       text NOT NULL,
  change_rate numeric NOT NULL,
  timestamp   timestamptz NOT NULL,
  updated_at  timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS news (
  id         text PRIMARY KEY,
  title      text NOT NULL,
  date       text,
  url        text NOT NULL,
  fetched_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS weather_cache (
  lat_bucket numeric NOT NULL,
  lon_bucket numeric NOT NULL,
  data       jsonb NOT NULL,
  fetched_at timestamptz NOT NULL,
  PRIMARY KEY (lat_bucket, lon_bucket)
);

CREATE TABLE IF NOT EXISTS devices (
  device_id  uuid PRIMARY KEY,
  first_seen timestamptz NOT NULL,
  last_seen  timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS device_station_views (
  device_id      uuid NOT NULL,
  station_id     text NOT NULL,
  view_count     integer NOT NULL DEFAULT 0,
  last_viewed_at timestamptz NOT NULL,
  PRIMARY KEY (device_id, station_id)
);
```

- [ ] **Step 2: Write the failing test** — `server/test/db.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { newDb } from 'pg-mem';
import { runMigrations } from '../src/db/index.js';

describe('runMigrations', () => {
  it('creates all tables', async () => {
    const mem = newDb();
    const { Pool } = mem.adapters.createPg();
    const pool = new Pool();
    await runMigrations(pool);
    const res = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
    );
    const names = res.rows.map((r: { table_name: string }) => r.table_name);
    expect(names).toContain('water_levels');
    expect(names).toContain('news');
    expect(names).toContain('weather_cache');
    expect(names).toContain('devices');
    expect(names).toContain('device_station_views');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd server && npm test db`
Expected: FAIL — cannot resolve `../src/db/index.js`.

- [ ] **Step 4: Write minimal implementation** — `server/src/db/index.ts`

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const here = dirname(fileURLToPath(import.meta.url));

export const SCHEMA_SQL = readFileSync(join(here, 'schema.sql'), 'utf8');

export function createPool(databaseUrl: string): pg.Pool {
  return new Pool({ connectionString: databaseUrl });
}

export async function runMigrations(pool: pg.Pool): Promise<void> {
  await pool.query(SCHEMA_SQL);
}
```

- [ ] **Step 5: Ensure `schema.sql` ships to `dist`**

The build must copy `schema.sql` next to the compiled JS. Update `server/package.json` `build` script:

```json
"build": "tsc && cp src/db/schema.sql dist/db/schema.sql"
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd server && npm test db`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/db/schema.sql server/src/db/index.ts server/package.json server/test/db.test.ts
git commit -m "feat(server): add db pool and schema migrations"
```

---

### Task 6: River store (upsert + read)

**Files:**
- Create: `server/src/stores/riverStore.ts`
- Test: `server/test/stores/riverStore.test.ts`

**Interfaces:**
- Consumes: `WaterLevel`, `StoredWaterLevel`, `Pool`.
- Produces:
  - `upsertWaterLevel(pool: Pool, wl: WaterLevel, now?: Date): Promise<void>`
  - `getWaterLevel(pool: Pool, stationId: string): Promise<StoredWaterLevel | null>`

- [ ] **Step 1: Write the failing test** — `server/test/stores/riverStore.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { newDb } from 'pg-mem';
import { runMigrations } from '../../src/db/index.js';
import { upsertWaterLevel, getWaterLevel } from '../../src/stores/riverStore.js';
import type { Pool } from 'pg';

let pool: Pool;
beforeEach(async () => {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  pool = new Pool();
  await runMigrations(pool);
});

describe('riverStore', () => {
  it('upserts and reads back a level', async () => {
    await upsertWaterLevel(pool, {
      stationId: 'parana', level: 2.77, trend: 'rising', changeRate: 27,
      timestamp: '2026-01-16T00:00:00.000Z',
    }, new Date('2026-01-16T01:00:00.000Z'));

    const got = await getWaterLevel(pool, 'parana');
    expect(got?.level).toBe(2.77);
    expect(got?.trend).toBe('rising');
    expect(got?.updatedAt).toBe('2026-01-16T01:00:00.000Z');
  });

  it('overwrites on second upsert', async () => {
    const base = { stationId: 'goya', trend: 'stable' as const, changeRate: 0, timestamp: '2026-01-16T00:00:00.000Z' };
    await upsertWaterLevel(pool, { ...base, level: 1.0 });
    await upsertWaterLevel(pool, { ...base, level: 1.5 });
    const got = await getWaterLevel(pool, 'goya');
    expect(got?.level).toBe(1.5);
  });

  it('returns null for unknown station', async () => {
    expect(await getWaterLevel(pool, 'nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test riverStore`
Expected: FAIL — cannot resolve `riverStore.js`.

- [ ] **Step 3: Write minimal implementation** — `server/src/stores/riverStore.ts`

```ts
import type { Pool } from 'pg';
import { WaterLevel, StoredWaterLevel, Trend } from '../types.js';

export async function upsertWaterLevel(pool: Pool, wl: WaterLevel, now: Date = new Date()): Promise<void> {
  await pool.query(
    `INSERT INTO water_levels (station_id, level, trend, change_rate, timestamp, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (station_id) DO UPDATE SET
       level=$2, trend=$3, change_rate=$4, timestamp=$5, updated_at=$6`,
    [wl.stationId, wl.level, wl.trend, wl.changeRate, wl.timestamp, now.toISOString()]
  );
}

export async function getWaterLevel(pool: Pool, stationId: string): Promise<StoredWaterLevel | null> {
  const res = await pool.query(
    `SELECT station_id, level, trend, change_rate, timestamp, updated_at
     FROM water_levels WHERE station_id=$1`,
    [stationId]
  );
  if (res.rows.length === 0) return null;
  const r = res.rows[0];
  return {
    stationId: r.station_id,
    level: Number(r.level),
    trend: r.trend as Trend,
    changeRate: Number(r.change_rate),
    timestamp: new Date(r.timestamp).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test riverStore`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/stores/riverStore.ts server/test/stores/riverStore.test.ts
git commit -m "feat(server): add river store"
```

---

### Task 7: News store (replace + read)

**Files:**
- Create: `server/src/stores/newsStore.ts`
- Test: `server/test/stores/newsStore.test.ts`

**Interfaces:**
- Consumes: `NewsItem`, `Pool`.
- Produces:
  - `replaceNews(pool: Pool, items: NewsItem[], now?: Date): Promise<void>` — replaces the whole news set in one transaction.
  - `getNews(pool: Pool, limit?: number): Promise<NewsItem[]>` — newest first by `fetched_at`.

- [ ] **Step 1: Write the failing test** — `server/test/stores/newsStore.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { newDb } from 'pg-mem';
import { runMigrations } from '../../src/db/index.js';
import { replaceNews, getNews } from '../../src/stores/newsStore.js';
import type { Pool } from 'pg';

let pool: Pool;
beforeEach(async () => {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  pool = new Pool();
  await runMigrations(pool);
});

describe('newsStore', () => {
  it('replaces and reads news', async () => {
    await replaceNews(pool, [
      { id: '/noticias/a', title: 'A', date: 'd1', url: 'https://x/a' },
      { id: '/noticias/b', title: 'B', date: 'd2', url: 'https://x/b' },
    ]);
    const items = await getNews(pool);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.id).sort()).toEqual(['/noticias/a', '/noticias/b']);
  });

  it('replace clears previous rows', async () => {
    await replaceNews(pool, [{ id: '/noticias/old', title: 'Old', date: 'd', url: 'https://x/old' }]);
    await replaceNews(pool, [{ id: '/noticias/new', title: 'New', date: 'd', url: 'https://x/new' }]);
    const items = await getNews(pool);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('/noticias/new');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test newsStore`
Expected: FAIL — cannot resolve `newsStore.js`.

- [ ] **Step 3: Write minimal implementation** — `server/src/stores/newsStore.ts`

```ts
import type { Pool } from 'pg';
import { NewsItem } from '../types.js';

export async function replaceNews(pool: Pool, items: NewsItem[], now: Date = new Date()): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM news');
    for (const it of items) {
      await client.query(
        `INSERT INTO news (id, title, date, url, fetched_at) VALUES ($1,$2,$3,$4,$5)`,
        [it.id, it.title, it.date, it.url, now.toISOString()]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function getNews(pool: Pool, limit = 10): Promise<NewsItem[]> {
  const res = await pool.query(
    `SELECT id, title, date, url FROM news ORDER BY fetched_at DESC LIMIT $1`,
    [limit]
  );
  return res.rows.map((r) => ({ id: r.id, title: r.title, date: r.date ?? '', url: r.url }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test newsStore`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/stores/newsStore.ts server/test/stores/newsStore.test.ts
git commit -m "feat(server): add news store"
```

---

### Task 8: Device store (ping + station view)

**Files:**
- Create: `server/src/stores/deviceStore.ts`
- Test: `server/test/stores/deviceStore.test.ts`

**Interfaces:**
- Consumes: `Pool`.
- Produces:
  - `pingDevice(pool: Pool, deviceId: string, stationId?: string, now?: Date): Promise<void>` — upserts the device (sets `first_seen` once, always bumps `last_seen`); if `stationId` given, increments that device+station view counter.

- [ ] **Step 1: Write the failing test** — `server/test/stores/deviceStore.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { newDb } from 'pg-mem';
import { runMigrations } from '../../src/db/index.js';
import { pingDevice } from '../../src/stores/deviceStore.js';
import type { Pool } from 'pg';

const DEV = '11111111-1111-1111-1111-111111111111';
let pool: Pool;
beforeEach(async () => {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  pool = new Pool();
  await runMigrations(pool);
});

describe('pingDevice', () => {
  it('creates device on first ping, keeps first_seen on second', async () => {
    await pingDevice(pool, DEV, undefined, new Date('2026-01-01T00:00:00.000Z'));
    await pingDevice(pool, DEV, undefined, new Date('2026-01-02T00:00:00.000Z'));
    const res = await pool.query('SELECT first_seen, last_seen FROM devices WHERE device_id=$1', [DEV]);
    expect(new Date(res.rows[0].first_seen).toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(new Date(res.rows[0].last_seen).toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });

  it('increments station view count across pings', async () => {
    await pingDevice(pool, DEV, 'parana');
    await pingDevice(pool, DEV, 'parana');
    const res = await pool.query(
      'SELECT view_count FROM device_station_views WHERE device_id=$1 AND station_id=$2',
      [DEV, 'parana']
    );
    expect(Number(res.rows[0].view_count)).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test deviceStore`
Expected: FAIL — cannot resolve `deviceStore.js`.

- [ ] **Step 3: Write minimal implementation** — `server/src/stores/deviceStore.ts`

```ts
import type { Pool } from 'pg';

export async function pingDevice(
  pool: Pool,
  deviceId: string,
  stationId?: string,
  now: Date = new Date()
): Promise<void> {
  const ts = now.toISOString();
  await pool.query(
    `INSERT INTO devices (device_id, first_seen, last_seen)
     VALUES ($1,$2,$2)
     ON CONFLICT (device_id) DO UPDATE SET last_seen=$2`,
    [deviceId, ts]
  );

  if (stationId) {
    await pool.query(
      `INSERT INTO device_station_views (device_id, station_id, view_count, last_viewed_at)
       VALUES ($1,$2,1,$3)
       ON CONFLICT (device_id, station_id) DO UPDATE SET
         view_count = device_station_views.view_count + 1,
         last_viewed_at = $3`,
      [deviceId, stationId, ts]
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test deviceStore`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/stores/deviceStore.ts server/test/stores/deviceStore.test.ts
git commit -m "feat(server): add device store"
```

---

### Task 9: Weather service (proxy + cache with TTL)

**Files:**
- Create: `server/src/services/weatherService.ts`
- Test: `server/test/services/weatherService.test.ts`

**Interfaces:**
- Consumes: `LocationWeather`, `Pool`.
- Produces:
  - `mapOpenMeteo(data: any, lat: number, lon: number): LocationWeather`
  - `getWeather(pool: Pool, lat: number, lon: number, deps?: { fetchFn?: typeof fetch; now?: Date; ttlMs?: number }): Promise<LocationWeather>`

- [ ] **Step 1: Write the failing test** — `server/test/services/weatherService.test.ts`

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { newDb } from 'pg-mem';
import { runMigrations } from '../../src/db/index.js';
import { getWeather, mapOpenMeteo } from '../../src/services/weatherService.js';
import type { Pool } from 'pg';

const OM = {
  current: { temperature_2m: 16.2, apparent_temperature: 15, relative_humidity_2m: 69, wind_speed_10m: 7, wind_direction_10m: 90, weather_code: 1, time: '2026-07-09T12:00' },
  daily: { time: ['2026-07-09'], temperature_2m_max: [19], temperature_2m_min: [9], weather_code: [1], precipitation_probability_max: [10] },
};

let pool: Pool;
beforeEach(async () => {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  pool = new Pool();
  await runMigrations(pool);
});

describe('mapOpenMeteo', () => {
  it('maps to LocationWeather shape', () => {
    const w = mapOpenMeteo(OM, -31.7, -60.5);
    expect(w.current.temperature).toBe(16);
    expect(w.current.description).toBe('Mayormente despejado');
    expect(w.daily).toHaveLength(1);
  });
});

describe('getWeather', () => {
  it('fetches on cache miss and stores', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(OM), { status: 200 }));
    const w = await getWeather(pool, -31.7, -60.5, { fetchFn: fetchFn as any, now: new Date('2026-07-09T12:00:00Z') });
    expect(w.current.temperature).toBe(16);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('serves cache within TTL without refetching', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(OM), { status: 200 }));
    const t0 = new Date('2026-07-09T12:00:00Z');
    await getWeather(pool, -31.7, -60.5, { fetchFn: fetchFn as any, now: t0, ttlMs: 60_000 });
    const t1 = new Date('2026-07-09T12:00:30Z');
    await getWeather(pool, -31.7, -60.5, { fetchFn: fetchFn as any, now: t1, ttlMs: 60_000 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test weatherService`
Expected: FAIL — cannot resolve `weatherService.js`.

- [ ] **Step 3: Write minimal implementation** — `server/src/services/weatherService.ts`

```ts
import type { Pool } from 'pg';
import { LocationWeather, CurrentWeather, WeatherForecast } from '../types.js';

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';
const DEFAULT_TTL_MS = 30 * 60 * 1000;

function degreesToDirection(d: number): string {
  return ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(d / 45) % 8];
}
function description(code: number): string {
  const m: Record<number, string> = {
    0: 'Despejado', 1: 'Mayormente despejado', 2: 'Parcialmente nublado', 3: 'Nublado',
    45: 'Niebla', 48: 'Niebla', 51: 'Llovizna', 53: 'Llovizna', 55: 'Llovizna',
    61: 'Lluvia', 63: 'Lluvia moderada', 65: 'Lluvia intensa', 80: 'Chubascos',
    81: 'Chubascos', 82: 'Chubascos', 95: 'Tormenta', 96: 'Tormenta con granizo', 99: 'Tormenta severa',
  };
  return m[code] || 'Desconocido';
}
function icon(code: number): string {
  if (code === 0) return 'sun';
  if (code <= 3) return 'cloud-sun';
  if (code <= 48) return 'cloud';
  if (code <= 65) return 'cloud-rain';
  if (code <= 82) return 'cloud-showers-heavy';
  return 'bolt';
}

export function mapOpenMeteo(data: any, latitude: number, longitude: number): LocationWeather {
  const c = data.current;
  const current: CurrentWeather = {
    temperature: Math.round(c.temperature_2m),
    feelsLike: Math.round(c.apparent_temperature),
    humidity: c.relative_humidity_2m,
    windSpeed: Math.round(c.wind_speed_10m),
    windDirection: degreesToDirection(c.wind_direction_10m),
    description: description(c.weather_code),
    icon: icon(c.weather_code),
    timestamp: new Date(c.time).toISOString(),
  };
  const daily: WeatherForecast[] = [];
  for (let i = 0; i < data.daily.time.length; i++) {
    daily.push({
      date: new Date(data.daily.time[i]).toISOString(),
      tempMax: Math.round(data.daily.temperature_2m_max[i]),
      tempMin: Math.round(data.daily.temperature_2m_min[i]),
      description: description(data.daily.weather_code[i]),
      icon: icon(data.daily.weather_code[i]),
      precipProbability: data.daily.precipitation_probability_max[i] || 0,
    });
  }
  return { latitude, longitude, current, daily };
}

function bucket(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function getWeather(
  pool: Pool,
  lat: number,
  lon: number,
  deps: { fetchFn?: typeof fetch; now?: Date; ttlMs?: number } = {}
): Promise<LocationWeather> {
  const fetchFn = deps.fetchFn ?? fetch;
  const now = deps.now ?? new Date();
  const ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS;
  const latB = bucket(lat);
  const lonB = bucket(lon);

  const cached = await pool.query(
    `SELECT data, fetched_at FROM weather_cache WHERE lat_bucket=$1 AND lon_bucket=$2`,
    [latB, lonB]
  );
  if (cached.rows.length > 0) {
    const age = now.getTime() - new Date(cached.rows[0].fetched_at).getTime();
    if (age < ttlMs) return cached.rows[0].data as LocationWeather;
  }

  try {
    const url =
      `${OPEN_METEO_URL}?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&timezone=America/Argentina/Buenos_Aires&forecast_days=7`;
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const weather = mapOpenMeteo(await res.json(), lat, lon);
    await pool.query(
      `INSERT INTO weather_cache (lat_bucket, lon_bucket, data, fetched_at)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (lat_bucket, lon_bucket) DO UPDATE SET data=$3, fetched_at=$4`,
      [latB, lonB, JSON.stringify(weather), now.toISOString()]
    );
    return weather;
  } catch (e) {
    if (cached.rows.length > 0) return cached.rows[0].data as LocationWeather; // stale fallback
    throw e;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test weatherService`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/weatherService.ts server/test/services/weatherService.test.ts
git commit -m "feat(server): add weather proxy service with cache"
```

---

### Task 10: API key guard middleware

**Files:**
- Create: `server/src/middleware/apiKey.ts`
- Test: `server/test/middleware/apiKey.test.ts`

**Interfaces:**
- Consumes: Fastify types.
- Produces: `apiKeyGuard(expectedKey: string)` returning a Fastify `preHandler` hook that replies 401 `{ error: 'unauthorized' }` unless `request.headers['x-api-key'] === expectedKey`.

- [ ] **Step 1: Write the failing test** — `server/test/middleware/apiKey.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { apiKeyGuard } from '../../src/middleware/apiKey.js';

function appWithGuard() {
  const app = Fastify();
  app.addHook('preHandler', apiKeyGuard('secret'));
  app.get('/protected', async () => ({ ok: true }));
  return app;
}

describe('apiKeyGuard', () => {
  it('rejects without key', async () => {
    const app = appWithGuard();
    const res = await app.inject({ method: 'GET', url: '/protected' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('allows with correct key', async () => {
    const app = appWithGuard();
    const res = await app.inject({ method: 'GET', url: '/protected', headers: { 'x-api-key': 'secret' } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test apiKey`
Expected: FAIL — cannot resolve `apiKey.js`.

- [ ] **Step 3: Write minimal implementation** — `server/src/middleware/apiKey.ts`

```ts
import { FastifyReply, FastifyRequest } from 'fastify';

export function apiKeyGuard(expectedKey: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.url === '/health') return;
    if (request.headers['x-api-key'] !== expectedKey) {
      reply.code(401).send({ error: 'unauthorized' });
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test apiKey`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/middleware/apiKey.ts server/test/middleware/apiKey.test.ts
git commit -m "feat(server): add api key guard"
```

---

### Task 11: Routes wiring (river, news, weather, devices)

**Files:**
- Modify: `server/src/server.ts`
- Create: `server/src/routes/index.ts`
- Test: `server/test/routes.test.ts`

**Interfaces:**
- Consumes: all stores (`getWaterLevel`, `getNews`, `pingDevice`), `getWeather`, `getStationById`.
- Produces:
  - `registerRoutes(app: FastifyInstance, deps: RouteDeps): void` where
    `RouteDeps = { pool: Pool; weatherDeps?: { fetchFn?: typeof fetch } }`.
  - `buildServer` gains signature `buildServer(opts?: { pool?: Pool; apiKey?: string; weatherDeps?: { fetchFn?: typeof fetch } }): FastifyInstance`. When `pool` is provided it registers the guard (if `apiKey`) and all routes.

- [ ] **Step 1: Write the failing test** — `server/test/routes.test.ts`

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { newDb } from 'pg-mem';
import { runMigrations } from '../src/db/index.js';
import { upsertWaterLevel } from '../src/stores/riverStore.js';
import { replaceNews } from '../src/stores/newsStore.js';
import { buildServer } from '../src/server.js';
import type { Pool } from 'pg';

const OM = {
  current: { temperature_2m: 16, apparent_temperature: 15, relative_humidity_2m: 69, wind_speed_10m: 7, wind_direction_10m: 90, weather_code: 1, time: '2026-07-09T12:00' },
  daily: { time: ['2026-07-09'], temperature_2m_max: [19], temperature_2m_min: [9], weather_code: [1], precipitation_probability_max: [10] },
};
const KEY = 'secret';
const H = { 'x-api-key': KEY };
let pool: Pool;

beforeEach(async () => {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  pool = new Pool();
  await runMigrations(pool);
});

function app() {
  const fetchFn = vi.fn(async () => new Response(JSON.stringify(OM), { status: 200 }));
  return buildServer({ pool, apiKey: KEY, weatherDeps: { fetchFn: fetchFn as any } });
}

describe('routes', () => {
  it('GET /river/:id returns stored level', async () => {
    await upsertWaterLevel(pool, { stationId: 'parana', level: 2.77, trend: 'rising', changeRate: 27, timestamp: '2026-01-16T00:00:00.000Z' });
    const a = app();
    const res = await a.inject({ method: 'GET', url: '/river/parana', headers: H });
    expect(res.statusCode).toBe(200);
    expect(res.json().level).toBe(2.77);
    await a.close();
  });

  it('GET /river/:id returns 404 for unknown station id', async () => {
    const a = app();
    const res = await a.inject({ method: 'GET', url: '/river/nope', headers: H });
    expect(res.statusCode).toBe(404);
    await a.close();
  });

  it('GET /news returns list', async () => {
    await replaceNews(pool, [{ id: '/noticias/a', title: 'A', date: 'd', url: 'https://x/a' }]);
    const a = app();
    const res = await a.inject({ method: 'GET', url: '/news', headers: H });
    expect(res.json()).toHaveLength(1);
    await a.close();
  });

  it('GET /weather returns weather', async () => {
    const a = app();
    const res = await a.inject({ method: 'GET', url: '/weather?lat=-31.7&lon=-60.5', headers: H });
    expect(res.json().current.temperature).toBe(16);
    await a.close();
  });

  it('GET /weather rejects invalid coords', async () => {
    const a = app();
    const res = await a.inject({ method: 'GET', url: '/weather?lat=abc&lon=-60.5', headers: H });
    expect(res.statusCode).toBe(400);
    await a.close();
  });

  it('POST /devices/ping records device', async () => {
    const a = app();
    const res = await a.inject({
      method: 'POST', url: '/devices/ping', headers: H,
      payload: { deviceId: '11111111-1111-1111-1111-111111111111', stationId: 'parana' },
    });
    expect(res.statusCode).toBe(204);
    const check = await pool.query('SELECT 1 FROM devices WHERE device_id=$1', ['11111111-1111-1111-1111-111111111111']);
    expect(check.rows).toHaveLength(1);
    await a.close();
  });

  it('rejects requests without api key', async () => {
    const a = app();
    const res = await a.inject({ method: 'GET', url: '/news' });
    expect(res.statusCode).toBe(401);
    await a.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test routes`
Expected: FAIL — `buildServer` does not accept options / routes missing.

- [ ] **Step 3: Create routes module** — `server/src/routes/index.ts`

```ts
import { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { getWaterLevel } from '../stores/riverStore.js';
import { getNews } from '../stores/newsStore.js';
import { pingDevice } from '../stores/deviceStore.js';
import { getWeather } from '../services/weatherService.js';
import { getStationById } from '../config/stations.js';

export interface RouteDeps {
  pool: Pool;
  weatherDeps?: { fetchFn?: typeof fetch };
}

const weatherQuery = z.object({ lat: z.coerce.number(), lon: z.coerce.number() });
const pingBody = z.object({ deviceId: z.string().uuid(), stationId: z.string().optional() });

export function registerRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const { pool } = deps;

  app.get('/river/:stationId', async (req, reply) => {
    const { stationId } = req.params as { stationId: string };
    if (!getStationById(stationId)) return reply.code(404).send({ error: 'unknown station' });
    const level = await getWaterLevel(pool, stationId);
    if (!level) return reply.code(404).send({ error: 'no data yet' });
    return level;
  });

  app.get('/news', async () => getNews(pool));

  app.get('/weather', async (req, reply) => {
    const parsed = weatherQuery.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid coordinates' });
    return getWeather(pool, parsed.data.lat, parsed.data.lon, deps.weatherDeps);
  });

  app.post('/devices/ping', async (req, reply) => {
    const parsed = pingBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });
    await pingDevice(pool, parsed.data.deviceId, parsed.data.stationId);
    return reply.code(204).send();
  });
}
```

- [ ] **Step 4: Update `server.ts` to wire routes and guard** — replace `server/src/server.ts`

```ts
import Fastify, { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { registerRoutes } from './routes/index.js';
import { apiKeyGuard } from './middleware/apiKey.js';

export interface BuildServerOptions {
  pool?: Pool;
  apiKey?: string;
  weatherDeps?: { fetchFn?: typeof fetch };
}

export function buildServer(opts: BuildServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get('/health', async () => ({ status: 'ok' }));

  if (opts.apiKey) app.addHook('preHandler', apiKeyGuard(opts.apiKey));
  if (opts.pool) registerRoutes(app, { pool: opts.pool, weatherDeps: opts.weatherDeps });

  return app;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npm test routes health`
Expected: PASS (routes: 7 tests; health still passes).

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/index.ts server/src/server.ts server/test/routes.test.ts
git commit -m "feat(server): wire river/news/weather/devices routes"
```

---

### Task 12: Cron refresh

**Files:**
- Create: `server/src/cron.ts`
- Test: `server/test/cron.test.ts`

**Interfaces:**
- Consumes: `STATIONS`, `fetchWaterLevel`, `fetchNews`, `upsertWaterLevel`, `replaceNews`, `Pool`.
- Produces:
  - `refreshRiver(pool: Pool, deps?: { fetchFn?: typeof fetch }): Promise<{ updated: number }>` — fetches each station; on per-station error, logs and skips (never wipes existing data).
  - `refreshNews(pool: Pool, deps?: { fetchFn?: typeof fetch }): Promise<{ updated: number }>` — replaces news only if at least one item parsed.
  - `startCron(pool: Pool): void` — schedules both every 15 min via `node-cron`.

- [ ] **Step 1: Write the failing test** — `server/test/cron.test.ts`

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { newDb } from 'pg-mem';
import { runMigrations } from '../src/db/index.js';
import { getWaterLevel } from '../src/stores/riverStore.js';
import { getNews } from '../src/stores/newsStore.js';
import { refreshRiver, refreshNews } from '../src/cron.js';
import type { Pool } from 'pg';

let pool: Pool;
beforeEach(async () => {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  pool = new Pool();
  await runMigrations(pool);
});

const riverHtml = `<td><i></i> 2026-01-16 <i></i> 00:00</td><td>2.77 Mts</td>`;
const newsHtml = `<a href="/noticias/a" class="panel"><time>d</time><h3>A</h3></a>`;

describe('refreshRiver', () => {
  it('stores levels for stations that succeed', async () => {
    const fetchFn = vi.fn(async () => new Response(riverHtml, { status: 200 }));
    const r = await refreshRiver(pool, { fetchFn: fetchFn as any });
    expect(r.updated).toBeGreaterThan(0);
    expect(await getWaterLevel(pool, 'parana')).not.toBeNull();
  });

  it('does not throw when a station fetch fails', async () => {
    const fetchFn = vi.fn(async () => new Response('err', { status: 500 }));
    const r = await refreshRiver(pool, { fetchFn: fetchFn as any });
    expect(r.updated).toBe(0);
  });
});

describe('refreshNews', () => {
  it('replaces news when items parse', async () => {
    const fetchFn = vi.fn(async () => new Response(newsHtml, { status: 200 }));
    await refreshNews(pool, { fetchFn: fetchFn as any });
    expect(await getNews(pool)).toHaveLength(1);
  });

  it('keeps existing news when parse yields nothing', async () => {
    const ok = vi.fn(async () => new Response(newsHtml, { status: 200 }));
    await refreshNews(pool, { fetchFn: ok as any });
    const empty = vi.fn(async () => new Response('<div>nada</div>', { status: 200 }));
    await refreshNews(pool, { fetchFn: empty as any });
    expect(await getNews(pool)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test cron`
Expected: FAIL — cannot resolve `cron.js`.

- [ ] **Step 3: Write minimal implementation** — `server/src/cron.ts`

```ts
import cron from 'node-cron';
import type { Pool } from 'pg';
import { STATIONS } from './config/stations.js';
import { fetchWaterLevel } from './scrapers/river.js';
import { fetchNews } from './scrapers/news.js';
import { upsertWaterLevel } from './stores/riverStore.js';
import { replaceNews } from './stores/newsStore.js';

export async function refreshRiver(pool: Pool, deps: { fetchFn?: typeof fetch } = {}): Promise<{ updated: number }> {
  let updated = 0;
  for (const station of STATIONS) {
    try {
      const wl = await fetchWaterLevel(station, deps.fetchFn);
      if (wl) {
        await upsertWaterLevel(pool, wl);
        updated++;
      }
    } catch (err) {
      console.error(`[cron] river ${station.id} failed:`, (err as Error).message);
    }
  }
  return { updated };
}

export async function refreshNews(pool: Pool, deps: { fetchFn?: typeof fetch } = {}): Promise<{ updated: number }> {
  try {
    const items = await fetchNews(deps.fetchFn);
    if (items.length > 0) {
      await replaceNews(pool, items);
      return { updated: items.length };
    }
  } catch (err) {
    console.error('[cron] news failed:', (err as Error).message);
  }
  return { updated: 0 };
}

export function startCron(pool: Pool): void {
  cron.schedule('*/15 * * * *', () => {
    refreshRiver(pool).catch((e) => console.error('[cron] river run error', e));
    refreshNews(pool).catch((e) => console.error('[cron] news run error', e));
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test cron`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/cron.ts server/test/cron.test.ts
git commit -m "feat(server): add cron refresh for river and news"
```

---

### Task 13: Entrypoint + Railway deploy config

**Files:**
- Create: `server/src/index.ts`
- Create: `server/railway.json`
- Modify: `server/src/server.ts` (register rate limit)
- Create: `server/README.md`

**Interfaces:**
- Consumes: `loadEnv`, `createPool`, `runMigrations`, `buildServer`, `startCron`, and `@fastify/rate-limit`.
- Produces: a runnable process (`npm start`) that migrates, starts cron, and listens on `PORT`.

- [ ] **Step 1: Register rate limiting in `buildServer`** — edit `server/src/server.ts`

Add the import and register the plugin before the guard. The full file becomes:

```ts
import Fastify, { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import type { Pool } from 'pg';
import { registerRoutes } from './routes/index.js';
import { apiKeyGuard } from './middleware/apiKey.js';

export interface BuildServerOptions {
  pool?: Pool;
  apiKey?: string;
  weatherDeps?: { fetchFn?: typeof fetch };
  rateLimit?: boolean;
}

export async function buildServer(opts: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  if (opts.rateLimit) {
    await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  }

  app.get('/health', async () => ({ status: 'ok' }));
  if (opts.apiKey) app.addHook('preHandler', apiKeyGuard(opts.apiKey));
  if (opts.pool) registerRoutes(app, { pool: opts.pool, weatherDeps: opts.weatherDeps });

  return app;
}
```

- [ ] **Step 2: Update existing tests for the now-async `buildServer`**

`buildServer` is now `async`. In `server/test/health.test.ts` and `server/test/routes.test.ts`, change `const app = buildServer(...)` / `const a = app()` call sites to `await`. In `routes.test.ts`, make the `app()` helper `async` and `await` its callers.

Example edit in `health.test.ts`:

```ts
const app = await buildServer();
```

Example edit in `routes.test.ts`:

```ts
async function app() {
  const fetchFn = vi.fn(async () => new Response(JSON.stringify(OM), { status: 200 }));
  return buildServer({ pool, apiKey: KEY, weatherDeps: { fetchFn: fetchFn as any } });
}
// ...and at each call site:
const a = await app();
```

- [ ] **Step 3: Run tests to verify they still pass**

Run: `cd server && npm test`
Expected: PASS (all suites green).

- [ ] **Step 4: Write the entrypoint** — `server/src/index.ts`

```ts
import { loadEnv } from './config/env.js';
import { createPool, runMigrations } from './db/index.js';
import { buildServer } from './server.js';
import { startCron, refreshRiver, refreshNews } from './cron.js';

async function main() {
  const env = loadEnv();
  const pool = createPool(env.databaseUrl);
  await runMigrations(pool);

  // Warm the caches once at boot so the API has data immediately.
  await Promise.allSettled([refreshRiver(pool), refreshNews(pool)]);
  startCron(pool);

  const app = await buildServer({ pool, apiKey: env.apiKey, rateLimit: true });
  await app.listen({ port: env.port, host: '0.0.0.0' });
  console.log(`[server] listening on ${env.port}`);
}

main().catch((err) => {
  console.error('[server] fatal', err);
  process.exit(1);
});
```

- [ ] **Step 5: Create Railway config** — `server/railway.json`

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "NIXPACKS", "buildCommand": "npm ci && npm run build" },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE"
  }
}
```

- [ ] **Step 6: Write deploy README** — `server/README.md`

```markdown
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
```

- [ ] **Step 7: Build to verify compilation**

Run: `cd server && npm run build`
Expected: `dist/` created, `dist/db/schema.sql` present, no TS errors.

- [ ] **Step 8: Commit**

```bash
git add server/src/index.ts server/src/server.ts server/railway.json server/README.md server/test/health.test.ts server/test/routes.test.ts
git commit -m "feat(server): add entrypoint, rate limiting, and Railway deploy config"
```

---

### Task 14: Manual deploy verification (Railway)

**Files:** none (operational task).

- [ ] **Step 1: Provision** — Create the Railway project, add PostgreSQL, add the service with Root Directory `server`, set `DATABASE_URL` and `APP_API_KEY`.

- [ ] **Step 2: Deploy and check health**

Run (after deploy): `curl https://<service>.up.railway.app/health`
Expected: `{"status":"ok"}`.

- [ ] **Step 3: Verify cron populated data** (wait ~1 min after boot for the warm-up refresh)

Run: `curl -H "x-api-key: <APP_API_KEY>" https://<service>.up.railway.app/river/parana`
Expected: JSON with a numeric `level` and an `updatedAt` timestamp.

- [ ] **Step 4: Verify news + weather**

Run: `curl -H "x-api-key: <APP_API_KEY>" "https://<service>.up.railway.app/news"`
Run: `curl -H "x-api-key: <APP_API_KEY>" "https://<service>.up.railway.app/weather?lat=-31.7&lon=-60.5"`
Expected: news array (may be empty if the source layout changed — check logs) and a weather object with `current.temperature`.

- [ ] **Step 5: Verify auth is enforced**

Run: `curl -i https://<service>.up.railway.app/news`
Expected: `401`.

- [ ] **Step 6: Record the base URL** — Note `https://<service>.up.railway.app` and the `APP_API_KEY`; these feed Plan 2 (app cutover) as `EXPO_PUBLIC_API_URL` and the shipped API key.

---

## Self-Review

**Spec coverage:**
- Single Fastify service + Postgres → Tasks 1, 5, 13. ✅
- Cron refresh river+news (~15 min) → Task 12. ✅
- Weather on-demand caching proxy (TTL 30 min, coord bucket) → Task 9. ✅
- Data model (5 tables) → Task 5. ✅
- Endpoints /health, /river/:id, /news, /weather, /devices/ping → Tasks 1, 11. ✅
- x-api-key on all routes + rate limit → Tasks 10, 13. ✅
- No client write path to river/news/weather → Task 11 (only GET; ping writes only device tables). ✅
- Response shapes mirror app types (ISO strings) → Task 2 types + stores/service. ✅
- Never overwrite good data with empty → Task 12 (river skips failures; news replaces only if items) + Task 9 (stale weather fallback). ✅
- Move existing parsers to backend → Tasks 3, 4, 9. ✅
- Anonymous device analytics (device + station views) → Task 8. ✅
- No data migration → nothing migrates; cron warms fresh. ✅
- Railway deploy → Tasks 13, 14. ✅

**Not in this plan (Plan 2 — app cutover):** removing `src/services/supabase.ts`, rewriting the app's `riverApi`/`newsApi`/`weatherApi` to call this API, `src/services/api/client.ts` with AsyncStorage local cache, `src/services/device.ts`, `EXPO_PUBLIC_API_URL` as an EAS env var, Data Safety form + privacy policy updates, and the phased production cutover. That plan is written after Task 14 yields a live base URL, and it ships only after the in-flight Play "misleading claims" build is approved.

**Placeholder scan:** none — every code step has real content.

**Type consistency:** `WaterLevel`/`StoredWaterLevel`/`NewsItem`/`LocationWeather` defined in Task 2 and used unchanged in Tasks 3–12. `buildServer` signature change (sync→async, options) is applied consistently in Tasks 11 and 13, with test call sites updated in Task 13 Step 2. `pingDevice`, `getWaterLevel`, `getNews`, `getWeather` signatures match their consumers in Task 11.
