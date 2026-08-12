import { WaterLevel } from '../../types';

// Shared backend cache used when PNA cannot be reached (for example, from
// outside Argentina). Release builds use the production API by default, while
// EXPO_PUBLIC_* variables allow environment-specific overrides.
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || 'https://api.rioparana.com.ar';
const API_KEY = process.env.EXPO_PUBLIC_APP_API_KEY || '';

const REQUEST_TIMEOUT_MS = 5000;

function withTimeout(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(id) };
}

interface StoredLevel {
  stationId: string;
  level: number;
  trend: 'rising' | 'falling' | 'stable';
  changeRate: number;
  timestamp: string;
}

function isStoredLevel(value: unknown, requestedStationId: string): value is StoredLevel {
  if (typeof value !== 'object' || value === null) return false;

  const candidate = value as Partial<StoredLevel>;
  return (
    candidate.stationId === requestedStationId &&
    typeof candidate.level === 'number' &&
    Number.isFinite(candidate.level) &&
    (candidate.trend === 'rising' ||
      candidate.trend === 'falling' ||
      candidate.trend === 'stable') &&
    typeof candidate.changeRate === 'number' &&
    Number.isFinite(candidate.changeRate) &&
    typeof candidate.timestamp === 'string' &&
    Number.isFinite(Date.parse(candidate.timestamp))
  );
}

// Read the shared cache. Returns null on any error so callers can render their
// existing unavailable state instead of throwing or hanging.
export async function getBackendLevel(stationId: string): Promise<WaterLevel | null> {
  const timeout = withTimeout(REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE_URL}/river/${stationId}`, {
      headers: { 'x-api-key': API_KEY },
      signal: timeout.signal,
    });
    if (!response.ok) return null;

    const data: unknown = await response.json();
    if (!isStoredLevel(data, stationId)) return null;

    return {
      stationId: data.stationId,
      level: data.level,
      trend: data.trend,
      changeRate: data.changeRate,
      timestamp: new Date(data.timestamp),
    };
  } catch {
    return null;
  } finally {
    timeout.clear();
  }
}

// Push a freshly scraped level to the shared cache. Best-effort: cache
// population must never break the user's request.
export async function pushBackendLevel(level: WaterLevel): Promise<void> {
  const timeout = withTimeout(REQUEST_TIMEOUT_MS);
  try {
    await fetch(`${API_BASE_URL}/river/${level.stationId}`, {
      method: 'POST',
      headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level: level.level,
        trend: level.trend,
        changeRate: level.changeRate,
        timestamp: level.timestamp.toISOString(),
      }),
      signal: timeout.signal,
    });
  } catch {
    // Ignore cache failures; the freshly scraped level remains usable.
  } finally {
    timeout.clear();
  }
}
