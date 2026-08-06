import { WaterLevel } from '../../types';

// Own backend (Fastify + Postgres on Hetzner/Coolify): an always-on, globally
// reachable shared cache. Phones inside Argentina scrape PNA and push levels
// here; everyone (including reviewers abroad) reads them back.
//
// Configure via EXPO_PUBLIC_* env vars (see .env.example). The fallbacks are
// what ships in the release build, so keep API_BASE_URL pointing at the live
// Coolify domain.
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || 'https://REPLACE-WITH-HETZNER-DOMAIN';
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
  updatedAt: string;
}

// Read the shared cache. Returns null on any error (never throws, never hangs).
export async function getBackendLevel(stationId: string): Promise<WaterLevel | null> {
  const t = withTimeout(REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE_URL}/river/${stationId}`, {
      headers: { 'x-api-key': API_KEY },
      signal: t.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as StoredLevel;
    return {
      stationId: data.stationId,
      level: Number(data.level),
      trend: data.trend,
      changeRate: Number(data.changeRate),
      timestamp: new Date(data.timestamp),
    };
  } catch {
    return null;
  } finally {
    t.clear();
  }
}

// Push a freshly scraped level to the shared cache. Best-effort, fire-and-forget.
export async function pushBackendLevel(level: WaterLevel): Promise<void> {
  const t = withTimeout(REQUEST_TIMEOUT_MS);
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
      signal: t.signal,
    });
  } catch {
    // Ignore — populating the cache must never break the user's request.
  } finally {
    t.clear();
  }
}
