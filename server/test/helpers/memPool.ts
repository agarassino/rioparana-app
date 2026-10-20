import { newDb, DataType } from 'pg-mem';
import type { Pool } from 'pg';
import { runMigrations } from '../../src/db/index.js';

// pg-mem ships without char_length, which the feedback_messages CHECK needs.
// Postgres counts code points, not UTF-16 units, and so does this.
export async function memPool(opts: { allowMigrationRerun?: boolean } = {}): Promise<Pool> {
  const mem = newDb();
  mem.public.registerFunction({
    name: 'char_length',
    args: [DataType.text],
    returns: DataType.integer,
    implementation: (s: string) => [...s].length,
  });
  const { Pool: MemPool } = mem.adapters.createPg();
  const pool = new MemPool() as Pool;
  await runMigrations(pool);
  // pg-mem skips existing CREATE TABLE execution before AST coverage runs.
  // Keep the first migration strict; opt out only for the explicit rerun test.
  if (opts.allowMigrationRerun) mem.options.noAstCoverageCheck = true;
  return pool;
}
