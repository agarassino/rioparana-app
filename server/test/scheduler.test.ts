import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Pool } from 'pg';
import { DEFAULT_REFRESH_INTERVAL_MS, startRefreshScheduler } from '../src/scheduler.js';

const pool = {} as Pool;
const INTERVAL = 1000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('startRefreshScheduler', () => {
  it('defaults to a fifteen minute interval', () => {
    expect(DEFAULT_REFRESH_INTERVAL_MS).toBe(15 * 60 * 1000);
  });

  it('does not refresh before the first interval elapses', async () => {
    const refresh = vi.fn(async () => {});
    startRefreshScheduler(pool, { intervalMs: INTERVAL, refresh });

    await vi.advanceTimersByTimeAsync(INTERVAL - 1);

    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes once per elapsed interval', async () => {
    const refresh = vi.fn(async () => {});
    startRefreshScheduler(pool, { intervalMs: INTERVAL, refresh });

    await vi.advanceTimersByTimeAsync(INTERVAL * 3);

    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('passes the pool to the refresh function', async () => {
    const refresh = vi.fn(async () => {});
    startRefreshScheduler(pool, { intervalMs: INTERVAL, refresh });

    await vi.advanceTimersByTimeAsync(INTERVAL);

    expect(refresh).toHaveBeenCalledWith(pool);
  });

  it('keeps scheduling after a refresh rejects', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const refresh = vi.fn(async () => {
      throw new Error('scrape failed');
    });
    startRefreshScheduler(pool, { intervalMs: INTERVAL, refresh });

    await vi.advanceTimersByTimeAsync(INTERVAL * 3);

    expect(refresh).toHaveBeenCalledTimes(3);
    expect(logged).toHaveBeenCalledTimes(3);
  });

  it('skips ticks while the previous refresh is still running', async () => {
    let release: (() => void) | undefined;
    const refresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    startRefreshScheduler(pool, { intervalMs: INTERVAL, refresh });

    await vi.advanceTimersByTimeAsync(INTERVAL * 3);
    expect(refresh).toHaveBeenCalledTimes(1);

    release?.();
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('stops refreshing once the returned stop function is called', async () => {
    const refresh = vi.fn(async () => {});
    const stop = startRefreshScheduler(pool, { intervalMs: INTERVAL, refresh });

    await vi.advanceTimersByTimeAsync(INTERVAL);
    stop();
    await vi.advanceTimersByTimeAsync(INTERVAL * 3);

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe('daily digest on the scheduler', () => {
  it('sends once when the window opens and not again that day', async () => {
    const send = vi.fn(async () => ({ sent: 1, skipped: 0, failed: 0 }));
    let now = new Date('2026-09-15T10:00:00Z');

    startRefreshScheduler(pool, {
      intervalMs: INTERVAL,
      refresh: async () => {},
      digest: send,
      now: () => now,
    });

    await vi.advanceTimersByTimeAsync(INTERVAL);
    now = new Date('2026-09-15T10:30:00Z');
    await vi.advanceTimersByTimeAsync(INTERVAL * 3);

    // The scheduler wakes four times here. Without the once-a-day guard every
    // subscriber gets four notifications.
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('stays quiet outside the window', async () => {
    const send = vi.fn(async () => ({ sent: 0, skipped: 0, failed: 0 }));

    startRefreshScheduler(pool, {
      intervalMs: INTERVAL,
      refresh: async () => {},
      digest: send,
      now: () => new Date('2026-09-15T03:00:00Z'),
    });

    await vi.advanceTimersByTimeAsync(INTERVAL * 3);

    expect(send).not.toHaveBeenCalled();
  });

  it('does not notify from data the refresh could not update', async () => {
    // A failed refresh means the newest reading is older than this tick
    // believes, and the digest would head it "today".
    const send = vi.fn(async () => ({ sent: 0, skipped: 0, failed: 0 }));

    startRefreshScheduler(pool, {
      intervalMs: INTERVAL,
      refresh: async () => {
        throw new Error('origin down');
      },
      digest: send,
      now: () => new Date('2026-09-15T10:00:00Z'),
    });

    await vi.advanceTimersByTimeAsync(INTERVAL * 2);

    expect(send).not.toHaveBeenCalled();
  });

  it('a failing digest does not stop the refresh cycle', async () => {
    const refresh = vi.fn(async () => {});
    startRefreshScheduler(pool, {
      intervalMs: INTERVAL,
      refresh,
      digest: async () => {
        throw new Error('expo down');
      },
      now: () => new Date('2026-09-15T10:00:00Z'),
    });

    await vi.advanceTimersByTimeAsync(INTERVAL * 3);

    expect(refresh.mock.calls.length).toBeGreaterThan(1);
  });
});
