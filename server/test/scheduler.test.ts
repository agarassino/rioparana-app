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
