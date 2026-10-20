// server/test/feedbackScheduler.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FEEDBACK_TICK_MS, startFeedbackJobs } from '../src/feedbackScheduler.js';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const T0 = new Date('2026-10-13T12:00:00.000Z');

describe('startFeedbackJobs', () => {
  it('ticks the owner email every five minutes', async () => {
    const emailTick = vi.fn(async () => ({ status: 'nothing_new' as const, messages: 0 }));
    const stop = startFeedbackJobs({ emailTick, purge: vi.fn(async () => 0), now: () => T0, log: () => {} });

    await vi.advanceTimersByTimeAsync(FEEDBACK_TICK_MS * 3);

    expect(FEEDBACK_TICK_MS).toBe(5 * 60_000);
    expect(emailTick).toHaveBeenCalledTimes(3);
    stop();
  });

  it('still purges when email is disabled', async () => {
    const purge = vi.fn(async () => 0);
    const stop = startFeedbackJobs({ emailTick: null, purge, now: () => T0, log: () => {} });

    await vi.advanceTimersByTimeAsync(FEEDBACK_TICK_MS);

    expect(purge).toHaveBeenCalledTimes(1);
    stop();
  });

  it('purges once a day, not every tick', async () => {
    let now = T0;
    const purge = vi.fn(async () => 0);
    const stop = startFeedbackJobs({ emailTick: null, purge, now: () => now, log: () => {} });

    for (let i = 0; i < 12; i++) { now = new Date(now.getTime() + FEEDBACK_TICK_MS); await vi.advanceTimersByTimeAsync(FEEDBACK_TICK_MS); }
    expect(purge).toHaveBeenCalledTimes(1);

    now = new Date(T0.getTime() + 24 * 3600_000 + FEEDBACK_TICK_MS);
    await vi.advanceTimersByTimeAsync(FEEDBACK_TICK_MS);
    expect(purge).toHaveBeenCalledTimes(2);
    stop();
  });

  it('keeps running after the email tick throws, and logs the failure', async () => {
    const log = vi.fn();
    const emailTick = vi.fn(async () => { throw new Error('db down'); });
    const purge = vi.fn(async () => 0);
    const stop = startFeedbackJobs({ emailTick, purge, now: () => T0, log });

    await vi.advanceTimersByTimeAsync(FEEDBACK_TICK_MS * 2);

    expect(emailTick).toHaveBeenCalledTimes(2);
    expect(purge).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('owner email tick failed'));
    stop();
  });

  it('logs a failed send so an outage is visible', async () => {
    const log = vi.fn();
    const emailTick = vi.fn(async () => ({ status: 'failed' as const, messages: 3 }));
    const stop = startFeedbackJobs({ emailTick, purge: vi.fn(async () => 0), now: () => T0, log });

    await vi.advanceTimersByTimeAsync(FEEDBACK_TICK_MS);

    expect(log).toHaveBeenCalledWith(expect.stringContaining('owner email not sent (3 pending)'));
    stop();
  });

  it('does not overlap a slow tick', async () => {
    let release!: () => void;
    const emailTick = vi.fn(() => new Promise<{ status: 'sent'; messages: number }>((r) => { release = () => r({ status: 'sent', messages: 1 }); }));
    const stop = startFeedbackJobs({ emailTick, purge: vi.fn(async () => 0), now: () => T0, log: () => {} });

    await vi.advanceTimersByTimeAsync(FEEDBACK_TICK_MS * 3);
    expect(emailTick).toHaveBeenCalledTimes(1);
    release();
    stop();
  });
});
