// server/src/admin/lockout.ts
// Keyed on the account, not the IP: there is one account, and an attacker on
// the tailnet can change IP more easily than the owner can change password.
export const MAX_FAILURES = 5;
export const LOCK_MS = 15 * 60_000;

export interface Lockout {
  isLocked(): boolean;
  recordFailure(): void;
  recordSuccess(): void;
}

export function createLockout(opts: { now?: () => number; maxFailures?: number; lockMs?: number } = {}): Lockout {
  const now = opts.now ?? Date.now;
  const max = opts.maxFailures ?? MAX_FAILURES;
  const lockMs = opts.lockMs ?? LOCK_MS;
  let failures = 0;
  let lockedUntil = 0;

  return {
    isLocked: () => now() < lockedUntil,
    recordFailure() {
      failures++;
      if (failures >= max) {
        lockedUntil = now() + lockMs;
        failures = 0;
      }
    },
    recordSuccess() {
      failures = 0;
    },
  };
}
