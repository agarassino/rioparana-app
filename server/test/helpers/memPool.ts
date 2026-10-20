import { newDb, DataType } from 'pg-mem';
import type { Pool } from 'pg';
import { runMigrations } from '../../src/db/index.js';

// pg-mem ships without char_length, which the feedback_messages CHECK needs.
// Postgres counts code points, not UTF-16 units, and so does this.
export async function memPool(): Promise<Pool> {
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
  return pool;
}
