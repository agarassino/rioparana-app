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
