import { createPool, runMigrations } from './db/index.js';

// Run as a separate approved job with an owner/migration-role DATABASE_URL.
// Runtime uses its own restricted URL and RUN_MIGRATIONS=false.
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required for migrations');
  const pool = createPool(url);
  try { await runMigrations(pool); }
  finally { await pool.end(); }
}
main().catch(() => {
  // Never print a connection string or credentials from driver exceptions.
  console.error('[migrate] failed; check database connectivity and migration permissions');
  process.exitCode = 1;
});
