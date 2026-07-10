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

  it('maps wind direction, humidity, and timestamp correctly', () => {
    const w = mapOpenMeteo(OM, -31.7, -60.5);
    expect(w.current.windDirection).toBe('E'); // 90° → 'E'
    expect(w.current.humidity).toBe(69);
    expect(w.current.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO string format
  });
});

describe('getWeather', () => {
  it('fetches on cache miss and stores', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(OM), { status: 200 }));
    const w = await getWeather(pool, -31.7, -60.5, { fetchFn: fetchFn as any, now: new Date('2026-07-09T12:00:00Z') });
    expect(w.current.temperature).toBe(16);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('serves cache within TTL without refetching and verifies jsonb round-trip', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(OM), { status: 200 }));
    const t0 = new Date('2026-07-09T12:00:00Z');
    await getWeather(pool, -31.7, -60.5, { fetchFn: fetchFn as any, now: t0, ttlMs: 60_000 });
    const t1 = new Date('2026-07-09T12:00:30Z');
    const w2 = await getWeather(pool, -31.7, -60.5, { fetchFn: fetchFn as any, now: t1, ttlMs: 60_000 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    // Prove jsonb round-trip: w2 is a parsed object, not a string
    expect(w2.current.temperature).toBe(16);
    expect(typeof w2.current).toBe('object');
    expect(typeof w2.current.temperature).toBe('number');
  });

  it('returns stale cache when fetch fails and cache exists', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(OM), { status: 200 }));
    const t0 = new Date('2026-07-09T12:00:00Z');
    await getWeather(pool, -31.7, -60.5, { fetchFn: fetchFn as any, now: t0, ttlMs: 60_000 });

    // Second call: now is past TTL and fetchFn rejects
    const t1 = new Date('2026-07-09T13:00:00Z'); // 60 min later, past 60s TTL
    const failingFetchFn = vi.fn(async () => {
      throw new Error('Network error');
    });
    const w2 = await getWeather(pool, -31.7, -60.5, { fetchFn: failingFetchFn as any, now: t1, ttlMs: 60_000 });

    // Should return stale cache instead of throwing
    expect(w2.current.temperature).toBe(16);
    expect(failingFetchFn).toHaveBeenCalledTimes(1);
  });

  it('throws when fresh pool and fetch fails', async () => {
    const failingFetchFn = vi.fn(async () => {
      throw new Error('Network error');
    });
    const now = new Date('2026-07-09T12:00:00Z');
    await expect(
      getWeather(pool, -31.7, -60.5, { fetchFn: failingFetchFn as any, now })
    ).rejects.toThrow('Network error');
    expect(failingFetchFn).toHaveBeenCalledTimes(1);
  });
});
