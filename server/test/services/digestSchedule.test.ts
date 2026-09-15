import { describe, it, expect } from 'vitest';
import { DIGEST_HOUR_UTC, shouldSendDigest } from '../../src/services/digestSchedule.js';

const at = (iso: string) => new Date(iso);

describe('shouldSendDigest', () => {
  it('fires at the chosen hour when it has never run', () => {
    expect(shouldSendDigest(at('2026-09-15T10:00:00Z'), null)).toBe(true);
  });

  it('stays quiet before the hour', () => {
    expect(shouldSendDigest(at('2026-09-15T09:59:00Z'), null)).toBe(false);
  });

  it('does not send twice in one day', () => {
    // The scheduler wakes every fifteen minutes. Without this every subscriber
    // gets four notifications an hour.
    const sentToday = at('2026-09-15T10:00:00Z');

    expect(shouldSendDigest(at('2026-09-15T10:15:00Z'), sentToday)).toBe(false);
    expect(shouldSendDigest(at('2026-09-15T23:00:00Z'), sentToday)).toBe(false);
  });

  it('sends again the next day', () => {
    const yesterday = at('2026-09-14T10:00:00Z');

    expect(shouldSendDigest(at('2026-09-15T10:00:00Z'), yesterday)).toBe(true);
  });

  it('still sends when the server was down at the exact hour', () => {
    // A restart at 10:20 must not cost the day's notification.
    expect(shouldSendDigest(at('2026-09-15T13:00:00Z'), null)).toBe(true);
  });

  it('gives up once the day is nearly over', () => {
    // At eleven at night a "good morning" reading is noise, and it would
    // collide with tomorrow's.
    expect(shouldSendDigest(at('2026-09-15T23:30:00Z'), null)).toBe(false);
  });

  it('sends at an hour people are awake in Argentina', () => {
    // UTC-3 all year: the hour here is the morning there, not the small hours.
    const local = DIGEST_HOUR_UTC - 3;
    expect(local).toBeGreaterThanOrEqual(6);
    expect(local).toBeLessThanOrEqual(9);
  });
});
