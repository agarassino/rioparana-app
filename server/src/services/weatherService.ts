import type { Pool } from 'pg';
import { LocationWeather, CurrentWeather, WeatherForecast } from '../types.js';

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';
const DEFAULT_TTL_MS = 30 * 60 * 1000;

function degreesToDirection(d: number): string {
  return ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(d / 45) % 8];
}
function description(code: number): string {
  const m: Record<number, string> = {
    0: 'Despejado', 1: 'Mayormente despejado', 2: 'Parcialmente nublado', 3: 'Nublado',
    45: 'Niebla', 48: 'Niebla', 51: 'Llovizna', 53: 'Llovizna', 55: 'Llovizna',
    61: 'Lluvia', 63: 'Lluvia moderada', 65: 'Lluvia intensa', 80: 'Chubascos',
    81: 'Chubascos', 82: 'Chubascos', 95: 'Tormenta', 96: 'Tormenta con granizo', 99: 'Tormenta severa',
  };
  return m[code] || 'Desconocido';
}
function icon(code: number): string {
  if (code === 0) return 'sun';
  if (code <= 3) return 'cloud-sun';
  if (code <= 48) return 'cloud';
  if (code <= 65) return 'cloud-rain';
  if (code <= 82) return 'cloud-showers-heavy';
  return 'bolt';
}

export function mapOpenMeteo(data: any, latitude: number, longitude: number): LocationWeather {
  const c = data.current;
  const current: CurrentWeather = {
    temperature: Math.round(c.temperature_2m),
    feelsLike: Math.round(c.apparent_temperature),
    humidity: c.relative_humidity_2m,
    windSpeed: Math.round(c.wind_speed_10m),
    windDirection: degreesToDirection(c.wind_direction_10m),
    description: description(c.weather_code),
    icon: icon(c.weather_code),
    timestamp: new Date(c.time).toISOString(),
  };
  const daily: WeatherForecast[] = [];
  for (let i = 0; i < data.daily.time.length; i++) {
    daily.push({
      date: new Date(data.daily.time[i]).toISOString(),
      tempMax: Math.round(data.daily.temperature_2m_max[i]),
      tempMin: Math.round(data.daily.temperature_2m_min[i]),
      description: description(data.daily.weather_code[i]),
      icon: icon(data.daily.weather_code[i]),
      precipProbability: data.daily.precipitation_probability_max[i] || 0,
    });
  }
  return { latitude, longitude, current, daily };
}

function bucket(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function getWeather(
  pool: Pool,
  lat: number,
  lon: number,
  deps: { fetchFn?: typeof fetch; now?: Date; ttlMs?: number } = {}
): Promise<LocationWeather> {
  const fetchFn = deps.fetchFn ?? fetch;
  const now = deps.now ?? new Date();
  const ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS;
  const latB = bucket(lat);
  const lonB = bucket(lon);

  const cached = await pool.query(
    `SELECT data, fetched_at FROM weather_cache WHERE lat_bucket=$1 AND lon_bucket=$2`,
    [latB, lonB]
  );
  if (cached.rows.length > 0) {
    const age = now.getTime() - new Date(cached.rows[0].fetched_at).getTime();
    if (age < ttlMs) return cached.rows[0].data as LocationWeather;
  }

  try {
    const url =
      `${OPEN_METEO_URL}?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&timezone=America/Argentina/Buenos_Aires&forecast_days=7`;
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const weather = mapOpenMeteo(await res.json(), lat, lon);
    await pool.query(
      `INSERT INTO weather_cache (lat_bucket, lon_bucket, data, fetched_at)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (lat_bucket, lon_bucket) DO UPDATE SET data=$3, fetched_at=$4`,
      [latB, lonB, JSON.stringify(weather), now.toISOString()]
    );
    return weather;
  } catch (e) {
    if (cached.rows.length > 0) return cached.rows[0].data as LocationWeather; // stale fallback
    throw e;
  }
}
