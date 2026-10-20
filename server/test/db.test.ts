// server/test/db.test.ts
import { describe, it, expect } from 'vitest';
import { runMigrations } from '../src/db/index.js';
import { memPool } from './helpers/memPool.js';

const DEVICE = '11111111-1111-4111-8111-111111111111';
const THREAD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

async function withThread() {
  const pool = await memPool();
  await pool.query(`INSERT INTO devices (device_id, first_seen, last_seen) VALUES ($1, now(), now())`, [DEVICE]);
  await pool.query(
    `INSERT INTO feedback_threads (id, device_id, kind, station_id, app_version, os_version, status, created_at, updated_at)
     VALUES ($1, $2, 'bug', 'rosario', '2.2.0', 'android 34', 'open', now(), now())`,
    [THREAD, DEVICE],
  );
  return pool;
}

const insertMessage = (pool: Awaited<ReturnType<typeof withThread>>, id: string, body: string) =>
  pool.query(
    `INSERT INTO feedback_messages (id, thread_id, author, body, created_at) VALUES ($1, $2, 'device', $3, now())`,
    [id, THREAD, body],
  );

describe('runMigrations', () => {
  it('creates all tables', async () => {
    const pool = await memPool();
    const res = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
    );
    const names = res.rows.map((r: { table_name: string }) => r.table_name);
    expect(names).toEqual(expect.arrayContaining([
      'water_levels', 'news', 'weather_cache', 'devices', 'device_station_views',
      'feedback_threads', 'feedback_messages', 'admin_audit', 'job_state',
    ]));
  });

  it('can run again on a database that already has everything', async () => {
    const pool = await memPool({ allowMigrationRerun: true });
    await expect(runMigrations(pool)).resolves.toBeUndefined();
  });

  it('limits a message to 2000 code points, not UTF-16 units', async () => {
    const pool = await withThread();
    await expect(insertMessage(pool, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', '😀'.repeat(2000))).resolves.toBeDefined();
    await expect(insertMessage(pool, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'a'.repeat(2001))).rejects.toThrow();
    await expect(insertMessage(pool, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', '')).rejects.toThrow();
  });

  it('rejects a kind the app does not offer', async () => {
    const pool = await withThread();
    await expect(pool.query(
      `INSERT INTO feedback_threads (id, device_id, kind, app_version, os_version, status, created_at, updated_at)
       VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', $1, 'rant', '2.2.0', 'android 34', 'open', now(), now())`,
      [DEVICE],
    )).rejects.toThrow();
  });

  it('deletes messages with their thread', async () => {
    const pool = await withThread();
    await insertMessage(pool, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'hola');
    await pool.query('DELETE FROM feedback_threads WHERE id = $1', [THREAD]);
    const left = await pool.query('SELECT COUNT(*) AS n FROM feedback_messages');
    expect(Number(left.rows[0].n)).toBe(0);
  });
});

it('keeps database constraints enforced in the scoped migration-rerun pool', async () => {
  const pool = await memPool({ allowMigrationRerun: true });
  await runMigrations(pool);
  await expect(pool.query('INSERT INTO devices (device_id) VALUES (NULL)')).rejects.toThrow();
  await expect(pool.query('CREATE TABLE devices (id text)')).rejects.toThrow();
  await pool.end();
});
