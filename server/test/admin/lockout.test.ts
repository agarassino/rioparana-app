// server/test/admin/lockout.test.ts
import { describe, it, expect } from 'vitest';
import { createLockout, LOCK_MS, MAX_FAILURES } from '../../src/admin/lockout.js';

describe('createLockout', () => {
  it('locks for 15 minutes after the fifth failure', () => {
    let t = 0;
    const lock = createLockout({ now: () => t });
    for (let i = 0; i < MAX_FAILURES - 1; i++) lock.recordFailure();
    expect(lock.isLocked()).toBe(false);

    lock.recordFailure();
    expect(lock.isLocked()).toBe(true);
    t = LOCK_MS - 1;
    expect(lock.isLocked()).toBe(true);
    t = LOCK_MS;
    expect(lock.isLocked()).toBe(false);
    expect([MAX_FAILURES, LOCK_MS]).toEqual([5, 15 * 60_000]);
  });

  it('starts counting again after a success', () => {
    const lock = createLockout();
    for (let i = 0; i < 4; i++) lock.recordFailure();
    lock.recordSuccess();
    lock.recordFailure();
    expect(lock.isLocked()).toBe(false);
  });
});
