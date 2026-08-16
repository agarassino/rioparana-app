import { describe, it, expect, beforeEach } from 'vitest';
import { newDb } from 'pg-mem';
import { runMigrations } from '../../src/db/index.js';
import { upsertWaterLevel, getWaterLevel, getAllWaterLevels } from '../../src/stores/riverStore.js';
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

describe('reference levels', () => {
  const base = {
    stationId: 'rosario',
    level: 3,
    trend: 'stable' as const,
    changeRate: 0,
    timestamp: '2026-08-14T15:00:00.000Z',
  };

  it('round-trips the alert and evacuation levels', async () => {
    await upsertWaterLevel(pool, { ...base, alertLevel: 5, evacuationLevel: 5.3 });

    const stored = await getWaterLevel(pool, 'rosario');

    expect(stored?.alertLevel).toBe(5);
    expect(stored?.evacuationLevel).toBe(5.3);
  });

  it('stores a reading that carries no reference levels', async () => {
    await upsertWaterLevel(pool, base);

    const stored = await getWaterLevel(pool, 'rosario');

    expect(stored?.level).toBe(3);
    expect(stored?.alertLevel).toBeUndefined();
    expect(stored?.evacuationLevel).toBeUndefined();
  });

  it('keeps the stored reference levels when a later push omits them', async () => {
    await upsertWaterLevel(pool, { ...base, alertLevel: 5, evacuationLevel: 5.3 });
    await upsertWaterLevel(pool, { ...base, level: 3.1 });

    const stored = await getWaterLevel(pool, 'rosario');

    expect(stored?.level).toBe(3.1);
    expect(stored?.alertLevel).toBe(5);
  });
});

describe('getAllWaterLevels', () => {
  it('returns every stored station', async () => {
    await upsertWaterLevel(pool, { stationId: 'rosario', level: 3, trend: 'stable', changeRate: 0, timestamp: '2026-08-14T15:00:00.000Z' });
    await upsertWaterLevel(pool, { stationId: 'parana', level: 2.83, trend: 'falling', changeRate: -4, timestamp: '2026-08-14T15:00:00.000Z' });

    const all = await getAllWaterLevels(pool);

    expect(all.map((l) => l.stationId).sort()).toEqual(['parana', 'rosario']);
  });

  it('returns an empty list when nothing is stored', async () => {
    expect(await getAllWaterLevels(pool)).toEqual([]);
  });

  it('carries the reference levels through', async () => {
    await upsertWaterLevel(pool, { stationId: 'rosario', level: 3, trend: 'stable', changeRate: 0, timestamp: '2026-08-14T15:00:00.000Z', alertLevel: 5 });

    const [rosario] = await getAllWaterLevels(pool);

    expect(rosario.alertLevel).toBe(5);
  });
});
