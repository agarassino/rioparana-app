import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const here = dirname(fileURLToPath(import.meta.url));

export const SCHEMA_SQL = readFileSync(join(here, 'schema.sql'), 'utf8');

export function createPool(databaseUrl: string): pg.Pool {
  const needsSsl = process.env.PGSSL === 'require' || /\.render\.com/.test(databaseUrl);
  return new Pool({
    connectionString: databaseUrl,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });
}

export async function runMigrations(pool: pg.Pool): Promise<void> {
  await pool.query(SCHEMA_SQL);
}
