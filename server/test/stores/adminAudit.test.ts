// server/test/stores/adminAudit.test.ts
import { describe, it, expect } from 'vitest';
import { memPool } from '../helpers/memPool.js';
import * as audit from '../../src/stores/adminAudit.js';

describe('adminAudit', () => {
  it('appends entries in order', async () => {
    const pool = await memPool();
    await audit.recordAudit(pool, 'login_failed', null, new Date('2026-10-13T12:00:00.000Z'));
    await audit.recordAudit(pool, 'reply', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', new Date('2026-10-13T12:01:00.000Z'));

    expect(await audit.listAudit(pool)).toEqual([
      { action: 'login_failed', threadId: null, at: '2026-10-13T12:00:00.000Z' },
      { action: 'reply', threadId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', at: '2026-10-13T12:01:00.000Z' },
    ]);
  });

  it('offers no way to change or remove an entry', () => {
    expect(Object.keys(audit).sort()).toEqual(['listAudit', 'recordAudit']);
  });
});
