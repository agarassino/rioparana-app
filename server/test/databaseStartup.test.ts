import { describe, it, expect, vi } from 'vitest';
import { prepareDatabase } from '../src/db/startup.js';
import { SCHEMA_SQL } from '../src/db/index.js';
import type { Pool } from 'pg';

describe('database startup', () => {
  it('runs the existing migration by default', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await prepareDatabase({ query } as unknown as Pool, true);
    expect(query).toHaveBeenCalledWith(SCHEMA_SQL);
  });
  it('only reads required schema when startup migrations are disabled', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await prepareDatabase({ query } as unknown as Pool, false);
    expect(query).toHaveBeenCalled();
    for (const [sql] of query.mock.calls as unknown as [string][]) expect(sql.trim()).toMatch(/^SELECT /);
  });
  it('fails startup when the separately migrated schema is missing', async () => {
    const query = vi.fn(async () => { throw new Error('missing column'); });
    await expect(prepareDatabase({ query } as unknown as Pool, false)).rejects.toThrow('missing column');
  });
});
