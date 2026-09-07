import { describe, it, expect, beforeEach } from 'vitest';
import { newDb } from 'pg-mem';
import { runMigrations } from '../../src/db/index.js';
import { recordReading, getHistory } from '../../src/stores/riverHistory.js';
import type { Pool } from 'pg';

const NOW = new Date('2026-09-06T12:00:00.000Z');
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

let pool: Pool;
beforeEach(async () => {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  pool = new Pool();
  await runMigrations(pool);
});

describe('river history', () => {
  it('returns nothing for a station never recorded', async () => {
    expect(await getHistory(pool, 'rosario', NOW)).toEqual([]);
  });

  it('keeps each reading', async () => {
    await recordReading(pool, 'rosario', daysAgo(2), 2.8);
    await recordReading(pool, 'rosario', daysAgo(1), 2.9);

    expect(await getHistory(pool, 'rosario', NOW)).toHaveLength(2);
  });

  it('returns them oldest first, ready to plot', async () => {
    await recordReading(pool, 'rosario', daysAgo(1), 2.9);
    await recordReading(pool, 'rosario', daysAgo(3), 2.7);

    const rows = await getHistory(pool, 'rosario', NOW);

    expect(rows.map((r) => r.level)).toEqual([2.7, 2.9]);
  });

  it('records the same reading twice without duplicating it', async () => {
    await recordReading(pool, 'rosario', daysAgo(1), 2.9);
    await recordReading(pool, 'rosario', daysAgo(1), 2.9);

    expect(await getHistory(pool, 'rosario', NOW)).toHaveLength(1);
  });

  it('corrects a level if the same instant is pushed with a new value', async () => {
    await recordReading(pool, 'rosario', daysAgo(1), 2.9);
    await recordReading(pool, 'rosario', daysAgo(1), 3.1);

    const rows = await getHistory(pool, 'rosario', NOW);

    expect(rows).toHaveLength(1);
    expect(rows[0].level).toBe(3.1);
  });

  it('leaves out readings older than the window', async () => {
    await recordReading(pool, 'rosario', daysAgo(40), 2.0);
    await recordReading(pool, 'rosario', daysAgo(2), 2.9);

    expect(await getHistory(pool, 'rosario', NOW)).toHaveLength(1);
  });

  it('keeps stations apart', async () => {
    await recordReading(pool, 'rosario', daysAgo(1), 2.9);
    await recordReading(pool, 'goya', daysAgo(1), 3.4);

    expect(await getHistory(pool, 'goya', NOW)).toHaveLength(1);
  });
});
