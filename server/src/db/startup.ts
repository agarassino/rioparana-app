import type { Pool } from 'pg';
import { runMigrations } from './index.js';

/** Restricted production runtime never executes DDL; migrate separately first. */
export async function prepareDatabase(pool: Pool, migrate: boolean): Promise<void> {
  if (migrate) {
    await runMigrations(pool);
    return;
  }
  // Fail closed instead of starting a partially migrated feedback runtime.
  await pool.query('SELECT token_hash, token_issued_at FROM devices LIMIT 0');
  await pool.query('SELECT id, status, unread_device FROM feedback_threads LIMIT 0');
  await pool.query('SELECT id, owner_emailed_at FROM feedback_messages LIMIT 0');
  await pool.query('SELECT id, action FROM admin_audit LIMIT 0');
  await pool.query('SELECT name, mark, ran_at FROM job_state LIMIT 0');
}
