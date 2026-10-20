// server/src/feedbackScheduler.ts
import type { EmailTickResult } from './services/ownerEmail.js';

export const FEEDBACK_TICK_MS = 5 * 60_000;
export const PURGE_EVERY_MS = 24 * 3600_000;

export interface FeedbackJobOptions {
  intervalMs?: number;
  /** Null when RESEND_API_KEY is missing: the purge still runs. */
  emailTick: (() => Promise<EmailTickResult>) | null;
  purge: () => Promise<number>;
  now?: () => Date;
  log?: (msg: string) => void;
}

// Separate from the 15-minute river refresh: the email promise is "within
// about 20 minutes", and a slow PNA scrape must not hold it up.
export function startFeedbackJobs(opts: FeedbackJobOptions): () => void {
  const intervalMs = opts.intervalMs ?? FEEDBACK_TICK_MS;
  const now = opts.now ?? (() => new Date());
  const log = opts.log ?? ((msg: string) => console.log(msg));
  let inFlight = false;
  let purgedAt: Date | null = null;

  async function tick(): Promise<void> {
    if (opts.emailTick) {
      try {
        const result = await opts.emailTick();
        if (result.status === 'failed') log(`[feedback] owner email not sent (${result.messages} pending); retrying next tick`);
        if (result.status === 'sent') log(`[feedback] owner email sent (${result.messages} messages)`);
      } catch (err) {
        log(`[feedback] owner email tick failed: ${(err as Error).message}`);
      }
    }

    const at = now();
    if (!purgedAt || at.getTime() - purgedAt.getTime() >= PURGE_EVERY_MS) {
      purgedAt = at;
      try {
        const removed = await opts.purge();
        if (removed > 0) log(`[feedback] purged ${removed} thread(s) past retention`);
      } catch (err) {
        log(`[feedback] purge failed: ${(err as Error).message}`);
      }
    }
  }

  const timer = setInterval(() => {
    if (inFlight) return;
    inFlight = true;
    tick().finally(() => {
      inFlight = false;
    });
  }, intervalMs);
  timer.unref?.();

  return () => clearInterval(timer);
}
