// server/src/stores/jobState.ts
import type { Queryable } from '../db/transaction.js';

export interface JobState {
  mark: Date | null;
  ranAt: Date | null;
}

const asDate = (v: unknown): Date | null => (v == null ? null : new Date(v as string));

export async function getJobState(pool: Queryable, name: string): Promise<JobState> {
  const res = await pool.query(`SELECT mark, ran_at FROM job_state WHERE name = $1`, [name]);
  const row = res.rows[0];
  return { mark: asDate(row?.mark), ranAt: asDate(row?.ran_at) };
}

export async function saveJobState(pool: Queryable, name: string, state: { mark: Date | null; ranAt: Date }): Promise<void> {
  await pool.query(
    `INSERT INTO job_state (name, mark, ran_at) VALUES ($1, $2, $3)
     ON CONFLICT (name) DO UPDATE SET mark = EXCLUDED.mark, ran_at = EXCLUDED.ran_at`,
    [name, state.mark?.toISOString() ?? null, state.ranAt.toISOString()],
  );
}
