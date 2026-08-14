import { CurrentWeather, LocationWeather, NewsItem, WaterLevel, WeatherForecast } from '../../types';

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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function toNewsItem(value: unknown): NewsItem | null {
  if (typeof value !== 'object' || value === null) return null;

  const candidate = value as Record<string, unknown>;
  if (!isNonEmptyString(candidate.id)) return null;
  if (!isNonEmptyString(candidate.title)) return null;
  if (!isNonEmptyString(candidate.url)) return null;

  return {
    id: candidate.id,
    title: candidate.title,
    url: candidate.url,
    date: typeof candidate.date === 'string' ? candidate.date : '',
  };
}

// Read the shared news cache. The backend scrapes argentina.gob.ar on its own
// schedule, so clients only read. Returns an empty list on any error.
export async function getBackendNews(): Promise<NewsItem[]> {
  const timeout = withTimeout(REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE_URL}/news`, {
      headers: { 'x-api-key': API_KEY },
      signal: timeout.signal,
    });
    if (!response.ok) return [];

    const data: unknown = await response.json();
    if (!Array.isArray(data)) return [];

    return data
      .map(toNewsItem)
      .filter((item): item is NewsItem => item !== null);
  } catch {
    return [];
  } finally {
    timeout.clear();
  }
}

function toDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function toCurrentWeather(value: unknown): CurrentWeather | null {
  if (typeof value !== 'object' || value === null) return null;

  const candidate = value as Record<string, unknown>;
  const timestamp = toDate(candidate.timestamp);
  if (!timestamp) return null;
  if (
    !isFiniteNumber(candidate.temperature) ||
    !isFiniteNumber(candidate.feelsLike) ||
    !isFiniteNumber(candidate.humidity) ||
    !isFiniteNumber(candidate.windSpeed)
  ) {
    return null;
  }
  if (
    !isNonEmptyString(candidate.windDirection) ||
    !isNonEmptyString(candidate.description) ||
    !isNonEmptyString(candidate.icon)
  ) {
    return null;
  }

  return {
    temperature: candidate.temperature,
    feelsLike: candidate.feelsLike,
    humidity: candidate.humidity,
    windSpeed: candidate.windSpeed,
    windDirection: candidate.windDirection,
    description: candidate.description,
    icon: candidate.icon,
    timestamp,
  };
}

function toForecast(value: unknown): WeatherForecast | null {
  if (typeof value !== 'object' || value === null) return null;

  const candidate = value as Record<string, unknown>;
  const date = toDate(candidate.date);
  if (!date) return null;
  if (!isFiniteNumber(candidate.tempMax) || !isFiniteNumber(candidate.tempMin)) return null;
  if (!isNonEmptyString(candidate.description) || !isNonEmptyString(candidate.icon)) return null;

  return {
    date,
    tempMax: candidate.tempMax,
    tempMin: candidate.tempMin,
    description: candidate.description,
    icon: candidate.icon,
    precipProbability: isFiniteNumber(candidate.precipProbability) ? candidate.precipProbability : 0,
  };
}

// Read the shared weather cache. The backend fetches Open-Meteo and caches it
// per coordinate bucket. Returns null on any error so callers keep their
// existing unavailable state.
export async function getBackendWeather(
  latitude: number,
  longitude: number
): Promise<LocationWeather | null> {
  const timeout = withTimeout(REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${API_BASE_URL}/weather?lat=${latitude}&lon=${longitude}`,
      { headers: { 'x-api-key': API_KEY }, signal: timeout.signal }
    );
    if (!response.ok) return null;

    const data: unknown = await response.json();
    if (typeof data !== 'object' || data === null) return null;

    const candidate = data as Record<string, unknown>;
    const current = toCurrentWeather(candidate.current);
    if (!current) return null;

    if (!Array.isArray(candidate.daily) || candidate.daily.length === 0) return null;
    const daily: WeatherForecast[] = [];
    for (const entry of candidate.daily) {
      const forecast = toForecast(entry);
      if (!forecast) return null;
      daily.push(forecast);
    }

    return { latitude, longitude, current, daily };
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
