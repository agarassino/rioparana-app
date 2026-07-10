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
