import type { Pool } from 'pg';

export type RegisterResult = 'issued' | 'already_registered';

/**
 * Trust on first use: the first caller to present a deviceId gets its token,
 * and nobody gets another one for that id afterwards. Two statements rather
 * than ON CONFLICT DO UPDATE … WHERE, because pg-mem ignores that WHERE and
 * would re-issue tokens in tests without anyone noticing.
 */
export async function registerDevice(
  pool: Pool,
  deviceId: string,
  tokenHash: string,
  now: Date = new Date(),
): Promise<RegisterResult> {
  const ts = now.toISOString();
  await pool.query(
    `INSERT INTO devices (device_id, first_seen, last_seen)
     VALUES ($1, $2, $2)
     ON CONFLICT (device_id) DO NOTHING`,
    [deviceId, ts],
  );
  const res = await pool.query(
    `UPDATE devices SET token_hash = $2, token_issued_at = $3, last_seen = $3
      WHERE device_id = $1 AND token_hash IS NULL
      RETURNING device_id`,
    [deviceId, tokenHash, ts],
  );
  return res.rows.length === 1 ? 'issued' : 'already_registered';
}

export async function deviceForTokenHash(pool: Pool, tokenHash: string): Promise<string | null> {
  const res = await pool.query(`SELECT device_id FROM devices WHERE token_hash = $1`, [tokenHash]);
  return res.rows[0] ? String(res.rows[0].device_id) : null;
}
