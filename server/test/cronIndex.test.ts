import { describe, it, expect, beforeEach, vi } from 'vitest';
import { newDb } from 'pg-mem';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runMigrations } from '../src/db/index.js';
import { getWaterLevel } from '../src/stores/riverStore.js';
import { refreshRiverFromIndex } from '../src/cron.js';
import type { Pool } from 'pg';

const FIXTURE = readFileSync(
  fileURLToPath(new URL('./fixtures/pna-index.html', import.meta.url)),
  'utf-8'
);

let pool: Pool;
beforeEach(async () => {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  pool = new Pool();
  await runMigrations(pool);
});

function indexFetch() {
  return vi.fn(async () => new Response(FIXTURE, { status: 200 })) as unknown as typeof fetch;
}

describe('refreshRiverFromIndex', () => {
  it('fetches the index once for every station', async () => {
    const fetchFn = indexFetch();

    await refreshRiverFromIndex(pool, { fetchFn });

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('stores the level for each station it knows', async () => {
    await refreshRiverFromIndex(pool, { fetchFn: indexFetch() });

    const rosario = await getWaterLevel(pool, 'rosario');
    expect(rosario?.level).toBe(3);
    expect(rosario?.trend).toBe('stable');

    const corrientes = await getWaterLevel(pool, 'corrientes');
    expect(corrientes?.level).toBe(3.2);
    expect(corrientes?.trend).toBe('falling');
  });

  it('reports how many stations it updated', async () => {
    const result = await refreshRiverFromIndex(pool, { fetchFn: indexFetch() });

    // The fixture carries six rows; five of them are configured stations.
    expect(result.updated).toBe(5);
  });

  it('ignores readings for stations the app does not list', async () => {
    await refreshRiverFromIndex(pool, { fetchFn: indexFetch() });

    // GUAYRA (BRASIL), code 21, is published but not configured.
    expect(await getWaterLevel(pool, 'guayra')).toBeNull();
  });

  it('returns zero updates when the index cannot be fetched', async () => {
    const failing = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const result = await refreshRiverFromIndex(pool, { fetchFn: failing });

    expect(result.updated).toBe(0);
  });
});

describe('reference levels', () => {
  it('stores the alert and evacuation levels published for each station', async () => {
    await refreshRiverFromIndex(pool, { fetchFn: indexFetch() });

    const rosario = await getWaterLevel(pool, 'rosario');
    expect(rosario?.alertLevel).toBe(5);
    expect(rosario?.evacuationLevel).toBe(5.3);
  });
});
