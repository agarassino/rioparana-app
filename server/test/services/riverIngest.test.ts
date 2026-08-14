import { describe, it, expect } from 'vitest';
import {
  MAX_LEVEL_M,
  MIN_LEVEL_M,
  validateIngest,
} from '../../src/services/riverIngest.js';
import type { StoredWaterLevel } from '../../src/types.js';

const NOW = new Date('2026-08-14T12:00:00.000Z');

function candidate(overrides: Partial<Parameters<typeof validateIngest>[0]> = {}) {
  return {
    level: 3.4,
    trend: 'rising' as const,
    changeRate: 5,
    timestamp: '2026-08-14T11:00:00.000Z',
    ...overrides,
  };
}

function stored(overrides: Partial<StoredWaterLevel> = {}): StoredWaterLevel {
  return {
    stationId: 'corrientes',
    level: 3.3,
    trend: 'rising',
    changeRate: 4,
    timestamp: '2026-08-14T10:00:00.000Z',
    updatedAt: '2026-08-14T10:00:00.000Z',
    ...overrides,
  };
}

describe('validateIngest', () => {
  it('accepts a plausible reading when nothing is stored yet', () => {
    expect(validateIngest(candidate(), null, NOW)).toBeNull();
  });

  it('accepts a plausible reading close to the stored value', () => {
    expect(validateIngest(candidate(), stored(), NOW)).toBeNull();
  });

  it('rejects a level below the physical range', () => {
    expect(validateIngest(candidate({ level: MIN_LEVEL_M - 0.1 }), null, NOW)).toBe(
      'level-out-of-range'
    );
  });

  it('rejects a level above the physical range', () => {
    expect(validateIngest(candidate({ level: MAX_LEVEL_M + 0.1 }), null, NOW)).toBe(
      'level-out-of-range'
    );
  });

  it('rejects the absurd level a poisoning attempt would send', () => {
    expect(validateIngest(candidate({ level: 9999 }), null, NOW)).toBe('level-out-of-range');
  });

  it('rejects a timestamp far in the future', () => {
    expect(
      validateIngest(candidate({ timestamp: '2026-08-14T13:00:00.000Z' }), null, NOW)
    ).toBe('timestamp-in-future');
  });

  it('tolerates a timestamp within the clock skew allowance', () => {
    expect(
      validateIngest(candidate({ timestamp: '2026-08-14T12:05:00.000Z' }), null, NOW)
    ).toBeNull();
  });

  it('rejects a reading older than a day', () => {
    expect(
      validateIngest(candidate({ timestamp: '2026-08-13T11:00:00.000Z' }), null, NOW)
    ).toBe('timestamp-too-old');
  });

  it('rejects an absurd change rate', () => {
    expect(validateIngest(candidate({ changeRate: 100000 }), null, NOW)).toBe(
      'change-rate-out-of-range'
    );
  });

  it('rejects a jump that the river could not physically make', () => {
    // stored 3.3 m one hour earlier; 8 m is a plausible-looking but impossible value
    expect(validateIngest(candidate({ level: 8 }), stored(), NOW)).toBe('implausible-jump');
  });

  it('allows a bigger difference when more time has elapsed', () => {
    const old = stored({ timestamp: '2026-08-14T06:00:00.000Z' });
    expect(validateIngest(candidate({ level: 5.2 }), old, NOW)).toBeNull();
  });

  it('skips the jump check when the stored reading is stale', () => {
    const stale = stored({ timestamp: '2026-07-31T15:00:00.000Z' });
    expect(validateIngest(candidate({ level: 8 }), stale, NOW)).toBeNull();
  });

  it('rejects a non finite level', () => {
    expect(validateIngest(candidate({ level: Number.NaN }), null, NOW)).toBe(
      'level-out-of-range'
    );
  });
});
