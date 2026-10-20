import type { Pool } from 'pg';
import { withTransaction, type Queryable } from '../db/transaction.js';

/** Registration's UPDATE takes the same row lock, closing the TOFU race. */
export async function withLegacyDevice<T>(pool: Pool, deviceId: string, work: (client: Queryable) => Promise<T>) {
  return withTransaction(pool, async (client) => {
    const ts = new Date().toISOString();
    await client.query(`INSERT INTO devices (device_id, first_seen, last_seen) VALUES ($1, $2, $2)
      ON CONFLICT (device_id) DO NOTHING`, [deviceId, ts]);
    const row = await client.query('SELECT token_hash FROM devices WHERE device_id = $1 FOR UPDATE', [deviceId]);
    if (!row.rows[0] || row.rows[0].token_hash !== null) return { allowed: false as const };
    return { allowed: true as const, value: await work(client) };
  });
}
