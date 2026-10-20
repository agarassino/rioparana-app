// server/src/services/feedbackRetention.ts
import type { Pool } from 'pg';

// The privacy policy promises 12 months after the last activity on a thread.
export const RETENTION_MONTHS = 12;

export function retentionCutoff(now: Date): Date {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - RETENTION_MONTHS);
  return cutoff;
}

/** Deletes idle threads; their messages go by ON DELETE CASCADE. Returns how many threads went. */
export async function purgeOldThreads(pool: Pool, now: Date = new Date()): Promise<number> {
  const res = await pool.query(
    `DELETE FROM feedback_threads WHERE updated_at < $1 RETURNING id`,
    [retentionCutoff(now).toISOString()],
  );
  return res.rows.length;
}
