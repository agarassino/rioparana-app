// server/test/stores/jobState.test.ts
import { describe, it, expect } from 'vitest';
import { memPool } from '../helpers/memPool.js';
import { getJobState, saveJobState } from '../../src/stores/jobState.js';

describe('jobState', () => {
  it('starts empty and keeps what was saved', async () => {
    const pool = await memPool();
    expect(await getJobState(pool, 'x')).toEqual({ mark: null, ranAt: null });

    const mark = new Date('2026-10-13T12:00:00.000Z');
    const ranAt = new Date('2026-10-13T12:05:00.000Z');
    await saveJobState(pool, 'x', { mark, ranAt });
    await saveJobState(pool, 'x', { mark, ranAt });

    expect(await getJobState(pool, 'x')).toEqual({ mark, ranAt });
  });
});
