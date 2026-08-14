import type { Pool } from 'pg';
import { refreshRiver, refreshNews } from './cron.js';

export const DEFAULT_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

// River and news are independent: one failing scrape must not cancel the other.
export async function refreshAll(pool: Pool): Promise<void> {
  await Promise.allSettled([refreshRiver(pool), refreshNews(pool)]);
}

export interface SchedulerOptions {
  intervalMs?: number;
  refresh?: (pool: Pool) => Promise<unknown>;
}

// Keeps the shared caches warm from inside the server process. Previously this
// depended on a GitHub Actions schedule, which never fired because scheduled
// workflows only run from the repository's default branch.
export function startRefreshScheduler(pool: Pool, options: SchedulerOptions = {}): () => void {
  const intervalMs = options.intervalMs ?? DEFAULT_REFRESH_INTERVAL_MS;
  const refresh = options.refresh ?? refreshAll;
  let inFlight = false;

  const timer = setInterval(() => {
    // A slow origin must not stack overlapping refreshes on top of each other.
    if (inFlight) return;
    inFlight = true;

    Promise.resolve()
      .then(() => refresh(pool))
      .catch((err) => console.error('[scheduler] refresh failed:', (err as Error).message))
      .finally(() => {
        inFlight = false;
      });
  }, intervalMs);

  // The HTTP listener keeps the process alive; the timer should not.
  timer.unref?.();

  return () => clearInterval(timer);
}
