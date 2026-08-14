import { StoredWaterLevel, Trend } from '../types.js';

// The ingest endpoint is crowd-fed: the API key ships inside the mobile bundle,
// so anyone can extract it and POST. These bounds cannot prove a reading is
// honest, but they keep a single forged request from poisoning a station.

// Hydrometric readings on the Paraná run from extreme bajante to historic
// flood. The range is deliberately generous; it only has to reject nonsense.
export const MIN_LEVEL_M = -3;
export const MAX_LEVEL_M = 15;

// changeRate is centimetres per scrape period (see riverApi: diff * 100).
export const MAX_CHANGE_RATE_CM = 500;

const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000;
const MAX_READING_AGE_MS = 24 * 60 * 60 * 1000;

// Only compare against a stored reading that is still recent; a stale one says
// nothing about what the river is doing now.
const TRUST_WINDOW_MS = 6 * 60 * 60 * 1000;
// Far above any real rate of change, so honest readings are never rejected.
const MAX_RISE_M_PER_HOUR = 0.5;
const MIN_JUMP_ALLOWANCE_M = 1;

export interface IngestCandidate {
  level: number;
  trend: Trend;
  changeRate: number;
  timestamp: string;
}

export type IngestRejection =
  | 'level-out-of-range'
  | 'timestamp-in-future'
  | 'timestamp-too-old'
  | 'change-rate-out-of-range'
  | 'implausible-jump';

export function validateIngest(
  candidate: IngestCandidate,
  stored: StoredWaterLevel | null,
  now: Date
): IngestRejection | null {
  if (
    !Number.isFinite(candidate.level) ||
    candidate.level < MIN_LEVEL_M ||
    candidate.level > MAX_LEVEL_M
  ) {
    return 'level-out-of-range';
  }

  if (!Number.isFinite(candidate.changeRate) || Math.abs(candidate.changeRate) > MAX_CHANGE_RATE_CM) {
    return 'change-rate-out-of-range';
  }

  const readingAt = Date.parse(candidate.timestamp);
  if (!Number.isFinite(readingAt)) return 'timestamp-too-old';
  const age = now.getTime() - readingAt;
  if (age < -MAX_CLOCK_SKEW_MS) return 'timestamp-in-future';
  if (age > MAX_READING_AGE_MS) return 'timestamp-too-old';

  if (stored) {
    const storedAt = Date.parse(stored.timestamp);
    const elapsed = readingAt - storedAt;
    if (Number.isFinite(storedAt) && elapsed >= 0 && elapsed <= TRUST_WINDOW_MS) {
      const allowance = Math.max(
        MIN_JUMP_ALLOWANCE_M,
        (elapsed / (60 * 60 * 1000)) * MAX_RISE_M_PER_HOUR
      );
      if (Math.abs(candidate.level - stored.level) > allowance) return 'implausible-jump';
    }
  }

  return null;
}
