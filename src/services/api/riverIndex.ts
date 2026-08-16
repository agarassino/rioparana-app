import { WaterLevel } from '../../types';
import { STATIONS } from '../../config/stations';

// Prefectura Naval publishes every port on one page. Scraping it once covers
// all the stations the app lists, instead of one request per station, so a
// single phone inside Argentina can refresh the whole shared cache.
const PNA_INDEX_URL = 'https://contenidosweb.prefecturanaval.gob.ar/alturas/';
const REQUEST_TIMEOUT_MS = 8000;

const MONTHS: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

const STATION_BY_CODE = new Map(STATIONS.map((s) => [s.code, s]));

function field(row: string, label: string): string | null {
  const match = new RegExp(`data-label="${label}"[^>]*>\\s*(?:<b>)?([^<]*)`, 'i').exec(row);
  return match ? match[1].trim() : null;
}

// "14/AUG/26 - 1200" in Argentine local time, which has no daylight saving.
function parseTimestamp(value: string): Date | null {
  const match = /^(\d{2})\/([A-Z]{3})\/(\d{2})\s*-\s*(\d{2})(\d{2})$/i.exec(value.trim());
  if (!match) return null;

  const [, day, monthName, year, hour, minute] = match;
  const month = MONTHS[monthName.toUpperCase()];
  if (!month) return null;

  const parsed = Date.parse(`20${year}-${month}-${day}T${hour}:${minute}:00-03:00`);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

function parseTrend(state: string | null): WaterLevel['trend'] {
  const normalized = (state ?? '').toUpperCase();
  if (normalized.startsWith('CRECE')) return 'rising';
  if (normalized.startsWith('BAJA')) return 'falling';
  return 'stable';
}

export function parseRiverIndex(html: string): WaterLevel[] {
  const levels: WaterLevel[] = [];
  const rowPattern = /<tr class="[^"]*"\s*>([\s\S]*?)<\/tr>/gi;

  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(html)) !== null) {
    const row = match[1];

    const code = /[?&]id=(\d+)/.exec(row)?.[1];
    const station = code ? STATION_BY_CODE.get(code) : undefined;
    if (!station) continue;

    const level = Number.parseFloat(field(row, 'Ultimo Registro:') ?? '');
    if (!Number.isFinite(level)) continue;

    const timestamp = parseTimestamp(field(row, 'Fecha Hora:') ?? '');
    if (!timestamp) continue;

    const variation = Number.parseFloat(field(row, 'Variacion') ?? '');
    const alertLevel = Number.parseFloat(field(row, 'Alerta:') ?? '');
    const evacuationLevel = Number.parseFloat(field(row, 'Evacuación:') ?? '');

    levels.push({
      stationId: station.id,
      level,
      trend: parseTrend(field(row, 'Estado:')),
      changeRate: Number.isFinite(variation) ? variation * 100 : 0,
      timestamp,
      ...(Number.isFinite(alertLevel) ? { alertLevel } : {}),
      ...(Number.isFinite(evacuationLevel) ? { evacuationLevel } : {}),
    });
  }

  return levels;
}

// Returns an empty list on any failure so callers fall back to the backend
// cache instead of throwing.
export async function fetchAllLevels(): Promise<WaterLevel[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(PNA_INDEX_URL, {
      headers: { Accept: 'text/html', 'User-Agent': 'ParanaInfo-App/1.0' },
      signal: controller.signal,
    });
    if (!response.ok) return [];

    return parseRiverIndex(await response.text());
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
