import type { Pool } from 'pg';
import { refreshRiverFromIndex, refreshNews } from './cron.js';
import { sendDailyDigest, type DigestResult } from './services/dailyPush.js';
import { shouldSendDigest } from './services/digestSchedule.js';

export const DEFAULT_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

// River and news are independent: one failing scrape must not cancel the other.
// The river uses the index page, which covers every station in one request.
export async function refreshAll(pool: Pool): Promise<void> {
  await Promise.allSettled([refreshRiverFromIndex(pool), refreshNews(pool)]);
}

export interface SchedulerOptions {
  intervalMs?: number;
  refresh?: (pool: Pool) => Promise<unknown>;
  /** Injected so the daily send can be tested without an Expo endpoint. */
  digest?: (pool: Pool) => Promise<DigestResult>;
  /** Injected so the window can be tested without waiting for morning. */
  now?: () => Date;
}

// Keeps the shared caches warm from inside the server process. Previously this
// depended on a GitHub Actions schedule, which never fired because scheduled
// workflows only run from the repository's default branch.
export function startRefreshScheduler(pool: Pool, options: SchedulerOptions = {}): () => void {
  const intervalMs = options.intervalMs ?? DEFAULT_REFRESH_INTERVAL_MS;
  const refresh = options.refresh ?? refreshAll;
  const digest = options.digest ?? ((p: Pool) => sendDailyDigest(p));
  const now = options.now ?? (() => new Date());
  let inFlight = false;
  let digestSentAt: Date | null = null;

  const timer = setInterval(() => {
    // A slow origin must not stack overlapping refreshes on top of each other.
    if (inFlight) return;
    inFlight = true;

    Promise.resolve()
      .then(() => refresh(pool))
      // Only after a refresh that worked: the digest reports the river, and a
      // failed refresh means the newest reading is older than this tick
      // believes. Its own failure is caught separately so a dead push endpoint
      // cannot silence the refresh that keeps the data fresh.
      .then(() => runDigest())
      .catch((err) => console.error('[scheduler] refresh failed:', (err as Error).message))
      .finally(() => {
        inFlight = false;
      });

    async function runDigest(): Promise<void> {
      const at = now();
      if (!shouldSendDigest(at, digestSentAt)) return;

      // Stamped before sending, not after: a send that throws half way through
      // must not be retried on the next tick and notify the first subscribers
      // a second time.
      digestSentAt = at;
      try {
        const result = await digest(pool);
        console.log('[scheduler] daily digest', result);
      } catch (err) {
        console.error('[scheduler] digest failed:', (err as Error).message);
      }
    }
  }, intervalMs);

  // The HTTP listener keeps the process alive; the timer should not.
  timer.unref?.();

  return () => clearInterval(timer);
}
