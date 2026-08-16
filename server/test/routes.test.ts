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

// Ingested readings must be recent, so tests cannot pin a literal date.
function recentIso(): string {
  return new Date().toISOString();
}
let pool: Pool;

beforeEach(async () => {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  pool = new Pool();
  await runMigrations(pool);
});

async function app(opts: { refreshFetch?: typeof fetch; refreshToken?: string } = {}) {
  const fetchFn = vi.fn(async () => new Response(JSON.stringify(OM), { status: 200 }));
  return buildServer({
    pool,
    apiKey: KEY,
    weatherDeps: { fetchFn: fetchFn as any },
    refreshFetch: opts.refreshFetch,
    refreshToken: opts.refreshToken,
  });
}

describe('routes', () => {
  it('GET /river/:id returns stored level', async () => {
    await upsertWaterLevel(pool, { stationId: 'parana', level: 2.77, trend: 'rising', changeRate: 27, timestamp: '2026-01-16T00:00:00.000Z' });
    const a = await app();
    const res = await a.inject({ method: 'GET', url: '/river/parana', headers: H });
    expect(res.statusCode).toBe(200);
    expect(res.json().level).toBe(2.77);
    await a.close();
  });

  it('GET /river/:id returns 404 for unknown station id', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: '/river/nope', headers: H });
    expect(res.statusCode).toBe(404);
    await a.close();
  });

  it('GET /news returns list', async () => {
    await replaceNews(pool, [{ id: '/noticias/a', title: 'A', date: 'd', url: 'https://x/a' }]);
    const a = await app();
    const res = await a.inject({ method: 'GET', url: '/news', headers: H });
    expect(res.json()).toHaveLength(1);
    await a.close();
  });

  it('GET /weather returns weather', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: '/weather?lat=-31.7&lon=-60.5', headers: H });
    expect(res.json().current.temperature).toBe(16);
    await a.close();
  });

  it('GET /weather rejects invalid coords', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: '/weather?lat=abc&lon=-60.5', headers: H });
    expect(res.statusCode).toBe(400);
    await a.close();
  });

  it('POST /devices/ping records device', async () => {
    const a = await app();
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
    const a = await app();
    const res = await a.inject({ method: 'GET', url: '/news' });
    expect(res.statusCode).toBe(401);
    await a.close();
  });

  it('GET /river/:id returns 404 for known station with no data', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: '/river/rosario', headers: H });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('no data yet');
    await a.close();
  });

  it('POST /river/:id ingests a crowd-sourced level and GET returns it', async () => {
    const a = await app();
    const res = await a.inject({
      method: 'POST', url: '/river/parana', headers: H,
      payload: { level: 3.14, trend: 'rising', changeRate: 12, timestamp: recentIso() },
    });
    expect(res.statusCode).toBe(204);
    const get = await a.inject({ method: 'GET', url: '/river/parana', headers: H });
    expect(get.json().level).toBe(3.14);
    expect(get.json().trend).toBe('rising');
    await a.close();
  });

  it('POST /river/:id returns 404 for unknown station', async () => {
    const a = await app();
    const res = await a.inject({
      method: 'POST', url: '/river/nope', headers: H,
      payload: { level: 1, trend: 'stable', changeRate: 0, timestamp: '2026-07-24T00:00:00.000Z' },
    });
    expect(res.statusCode).toBe(404);
    await a.close();
  });

  it('POST /river/:id rejects an invalid body', async () => {
    const a = await app();
    const res = await a.inject({
      method: 'POST', url: '/river/parana', headers: H,
      payload: { level: 'high', trend: 'up' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid body');
    await a.close();
  });

  it('POST /river/:id rejects an implausible level without touching stored data', async () => {
    const a = await app();
    await a.inject({
      method: 'POST', url: '/river/parana', headers: H,
      payload: { level: 3.14, trend: 'rising', changeRate: 12, timestamp: recentIso() },
    });

    const res = await a.inject({
      method: 'POST', url: '/river/parana', headers: H,
      payload: { level: 9999, trend: 'rising', changeRate: 12, timestamp: recentIso() },
    });

    expect(res.statusCode).toBe(422);
    const get = await a.inject({ method: 'GET', url: '/river/parana', headers: H });
    expect(get.json().level).toBe(3.14);
    await a.close();
  });

  it('POST /river/:id rejects a reading older than a day', async () => {
    const a = await app();
    const res = await a.inject({
      method: 'POST', url: '/river/parana', headers: H,
      payload: {
        level: 3.14, trend: 'rising', changeRate: 12,
        timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      },
    });
    expect(res.statusCode).toBe(422);
    await a.close();
  });

  it('POST /river/:id rejects a forged jump from a recent reading', async () => {
    const a = await app();
    await a.inject({
      method: 'POST', url: '/river/parana', headers: H,
      payload: { level: 3.14, trend: 'rising', changeRate: 12, timestamp: recentIso() },
    });

    const res = await a.inject({
      method: 'POST', url: '/river/parana', headers: H,
      payload: { level: 9, trend: 'rising', changeRate: 12, timestamp: recentIso() },
    });

    expect(res.statusCode).toBe(422);
    await a.close();
  });

  it('POST /river stores every plausible reading in a batch', async () => {
    const a = await app();
    const res = await a.inject({
      method: 'POST', url: '/river', headers: H,
      payload: { readings: [
        { stationId: 'parana', level: 2.83, trend: 'stable', changeRate: 0, timestamp: recentIso() },
        { stationId: 'rosario', level: 3.0, trend: 'stable', changeRate: 0, timestamp: recentIso() },
      ] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ stored: 2, rejected: 0 });
    const get = await a.inject({ method: 'GET', url: '/river/parana', headers: H });
    expect(get.json().level).toBe(2.83);
    await a.close();
  });

  it('POST /river keeps the good readings when one is implausible', async () => {
    const a = await app();
    const res = await a.inject({
      method: 'POST', url: '/river', headers: H,
      payload: { readings: [
        { stationId: 'parana', level: 2.83, trend: 'stable', changeRate: 0, timestamp: recentIso() },
        { stationId: 'rosario', level: 9999, trend: 'stable', changeRate: 0, timestamp: recentIso() },
      ] },
    });

    expect(res.json()).toMatchObject({ stored: 1, rejected: 1 });
    const get = await a.inject({ method: 'GET', url: '/river/rosario', headers: H });
    expect(get.statusCode).toBe(404);
    await a.close();
  });

  it('POST /river skips unknown stations without failing the batch', async () => {
    const a = await app();
    const res = await a.inject({
      method: 'POST', url: '/river', headers: H,
      payload: { readings: [
        { stationId: 'nope', level: 3, trend: 'stable', changeRate: 0, timestamp: recentIso() },
        { stationId: 'parana', level: 2.83, trend: 'stable', changeRate: 0, timestamp: recentIso() },
      ] },
    });

    expect(res.json()).toMatchObject({ stored: 1, rejected: 1 });
    await a.close();
  });

  it('POST /river rejects a malformed batch', async () => {
    const a = await app();
    const res = await a.inject({
      method: 'POST', url: '/river', headers: H, payload: { readings: 'nope' },
    });
    expect(res.statusCode).toBe(400);
    await a.close();
  });

  it('POST /river rejects requests without api key', async () => {
    const a = await app();
    const res = await a.inject({
      method: 'POST', url: '/river',
      payload: { readings: [] },
    });
    expect(res.statusCode).toBe(401);
    await a.close();
  });

  it('POST /river/:id rejects requests without api key', async () => {
    const a = await app();
    const res = await a.inject({
      method: 'POST', url: '/river/parana',
      payload: { level: 3.14, trend: 'rising', changeRate: 12, timestamp: '2026-07-24T00:00:00.000Z' },
    });
    expect(res.statusCode).toBe(401);
    await a.close();
  });

  it('POST /devices/ping rejects invalid deviceId', async () => {
    const a = await app();
    const res = await a.inject({
      method: 'POST', url: '/devices/ping', headers: H,
      payload: { deviceId: 'not-a-uuid', stationId: 'parana' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid body');
    await a.close();
  });

  it('GET /weather rejects missing coords', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: '/weather?lat=-31.7', headers: H });
    expect(res.statusCode).toBe(400);
    await a.close();
  });

  it('GET /weather rejects out-of-range coords', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: '/weather?lat=200&lon=-60.5', headers: H });
    expect(res.statusCode).toBe(400);
    await a.close();
  });

  it('POST /refresh rejects requests without api key', async () => {
    const a = await app({ refreshToken: 'testtoken' });
    const res = await a.inject({ method: 'POST', url: '/refresh' });
    expect(res.statusCode).toBe(401);
    await a.close();
  });

  it('POST /refresh scrapes river and news via injected fetch and stores them', async () => {
    const riverHtml = '<td><i></i> 2026-01-16 <i></i> 00:00</td><td>2.77 Mts</td>';
    const newsHtml = '<a href="/noticias/x" class="panel"><time>d</time><h3>T</h3></a>';
    const refreshFetch = vi.fn(async (url: string | URL | Request) => {
      const u = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      if (u.includes('/alturas')) return new Response(riverHtml, { status: 200 });
      if (u.includes('/noticias-pna')) return new Response(newsHtml, { status: 200 });
      return new Response('', { status: 404 });
    });
    const a = await app({ refreshFetch: refreshFetch as any, refreshToken: 'testtoken' });
    const res = await a.inject({
      method: 'POST',
      url: '/refresh',
      headers: { ...H, 'x-refresh-token': 'testtoken' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().river.updated).toBeGreaterThan(0);
    expect(res.json().news.updated).toBeGreaterThan(0);
    await a.close();
  });

  it('POST /refresh rejects a wrong refresh token', async () => {
    const a = await app({ refreshToken: 'testtoken' });
    const res = await a.inject({
      method: 'POST',
      url: '/refresh',
      headers: { ...H, 'x-refresh-token': 'wrong' },
    });
    expect(res.statusCode).toBe(401);
    await a.close();
  });

  it('POST /refresh rejects missing refresh token header', async () => {
    const a = await app({ refreshToken: 'testtoken' });
    const res = await a.inject({
      method: 'POST',
      url: '/refresh',
      headers: H,
    });
    expect(res.statusCode).toBe(401);
    await a.close();
  });

  it('POST /refresh is disabled (404) when no refresh token is configured', async () => {
    const a = await app();
    const res = await a.inject({ method: 'POST', url: '/refresh', headers: H });
    expect(res.statusCode).toBe(404);
    await a.close();
  });
});

describe('reference levels', () => {
  it('GET /river/:id exposes the alert and evacuation levels', async () => {
    const a = await app();
    await a.inject({
      method: 'POST', url: '/river', headers: H,
      payload: { readings: [{
        stationId: 'rosario', level: 3, trend: 'stable', changeRate: 0,
        timestamp: recentIso(), alertLevel: 5, evacuationLevel: 5.3,
      }] },
    });

    const res = await a.inject({ method: 'GET', url: '/river/rosario', headers: H });

    expect(res.json().alertLevel).toBe(5);
    expect(res.json().evacuationLevel).toBe(5.3);
    await a.close();
  });

  it('POST /river accepts a reading without reference levels', async () => {
    const a = await app();
    const res = await a.inject({
      method: 'POST', url: '/river', headers: H,
      payload: { readings: [{
        stationId: 'rosario', level: 3, trend: 'stable', changeRate: 0, timestamp: recentIso(),
      }] },
    });

    expect(res.json()).toMatchObject({ stored: 1, rejected: 0 });
    await a.close();
  });
});
