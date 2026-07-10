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
