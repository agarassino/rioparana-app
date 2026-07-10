import { Station, WaterLevel, Trend } from '../types.js';

const PNA_BASE_URL = 'https://contenidosweb.prefecturanaval.gob.ar/alturas';

export function buildRiverUrl(code: string): string {
  return `${PNA_BASE_URL}/?page=historico&tiempo=7&id=${code}`;
}

export function parseWaterLevel(html: string, stationId: string): WaterLevel | null {
  const datePattern =
    /<td[^>]*><i[^>]*><\/i>\s*(\d{4}-\d{2}-\d{2})\s*<i[^>]*><\/i>\s*(\d{2}:\d{2})<\/td>/gi;
  const levelPattern = /<td[^>]*>(\d+\.?\d*)\s*Mts<\/td>/gi;

  const dates: { date: string; time: string }[] = [];
  const levels: number[] = [];

  let dm: RegExpExecArray | null;
  while ((dm = datePattern.exec(html)) !== null) dates.push({ date: dm[1], time: dm[2] });
  let lm: RegExpExecArray | null;
  while ((lm = levelPattern.exec(html)) !== null) levels.push(parseFloat(lm[1]));

  if (dates.length === 0 || levels.length === 0) return null;

  const currentLevel = levels[0];
  const timestamp = new Date(`${dates[0].date}T${dates[0].time}:00-03:00`).toISOString();

  let trend: Trend = 'stable';
  let changeRate = 0;
  if (levels.length > 1) {
    const diff = currentLevel - levels[1];
    changeRate = diff * 100;
    if (diff > 0.02) trend = 'rising';
    else if (diff < -0.02) trend = 'falling';
  }

  return { stationId, level: currentLevel, trend, changeRate, timestamp };
}

export async function fetchWaterLevel(
  station: Station,
  fetchFn: typeof fetch = fetch
): Promise<WaterLevel | null> {
  const res = await fetchFn(buildRiverUrl(station.code), {
    headers: { Accept: 'text/html', 'User-Agent': 'ParanaInfo-Server/1.0' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return parseWaterLevel(html, station.id);
}
