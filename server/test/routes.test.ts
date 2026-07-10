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
