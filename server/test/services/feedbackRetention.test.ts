// server/test/services/feedbackRetention.test.ts
import { describe, it, expect } from 'vitest';
import { memPool } from '../helpers/memPool.js';
import { A } from '../helpers/devices.js';
import { registerDevice } from '../../src/stores/deviceTokenStore.js';
import { createThread } from '../../src/stores/feedbackStore.js';
import { purgeOldThreads, retentionCutoff } from '../../src/services/feedbackRetention.js';

const NOW = new Date('2026-10-13T12:00:00.000Z');

describe('purgeOldThreads', () => {
  it('deletes threads idle for more than 12 months, with their messages', async () => {
    const pool = await memPool();
    await registerDevice(pool, A, 'h');
    const base = { deviceId: A, kind: 'bug' as const, stationId: null, appVersion: '2.2.0', osVersion: 'android 34' };
    await createThread(pool, { ...base, body: 'vieja' }, new Date('2025-10-12T11:59:59.000Z'));
    const kept = await createThread(pool, { ...base, body: 'reciente' }, new Date('2025-10-13T12:00:01.000Z'));

    expect(await purgeOldThreads(pool, NOW)).toBe(1);

    const threads = await pool.query('SELECT id FROM feedback_threads');
    expect(threads.rows.map((r) => String(r.id))).toEqual([kept.id]);
    const messages = await pool.query('SELECT COUNT(*) AS n FROM feedback_messages');
    expect(Number(messages.rows[0].n)).toBe(1);
  });

  it('puts the cutoff twelve calendar months back', () => {
    expect(retentionCutoff(NOW).toISOString()).toBe('2025-10-13T12:00:00.000Z');
  });
});
