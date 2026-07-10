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
