// When the daily notification goes out.
//
// The scheduler wakes every fifteen minutes, so this has to answer "is now the
// moment" rather than be a cron expression.

/** Argentina is UTC-3 all year, so this is 07:00 there. */
export const DIGEST_HOUR_UTC = 10;

// A restart at 10:20 must not cost the day's notification, so the window is
// open rather than a single instant — but it closes well before midnight, or a
// server that came up at 23:50 would send a "good morning" reading into the
// night and collide with tomorrow's.
const WINDOW_CLOSES_UTC = 22;

const sameUtcDay = (a: Date, b: Date) =>
  a.getUTCFullYear() === b.getUTCFullYear() &&
  a.getUTCMonth() === b.getUTCMonth() &&
  a.getUTCDate() === b.getUTCDate();

export function shouldSendDigest(now: Date, lastSentAt: Date | null): boolean {
  const hour = now.getUTCHours();
  if (hour < DIGEST_HOUR_UTC || hour >= WINDOW_CLOSES_UTC) return false;

  // Without this every subscriber gets one per scheduler tick.
  return lastSentAt === null || !sameUtcDay(now, lastSentAt);
}
