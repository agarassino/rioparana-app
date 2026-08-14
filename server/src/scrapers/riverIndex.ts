import { Trend } from '../types.js';

// The index publishes every station in a single page, unlike the per-station
// historical view which needs one request per code. Each row also carries the
// station code, the published variation and the rise/fall state, so a single
// fetch yields everything the app stores.
const PNA_INDEX_URL = 'https://contenidosweb.prefecturanaval.gob.ar/alturas/';

const MONTHS: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

export interface IndexReading {
  code: string;
  name: string;
  river: string;
  level: number;
  trend: Trend;
  changeRate: number;
  timestamp: string;
}

function field(row: string, label: string): string | null {
  const match = new RegExp(`data-label="${label}"[^>]*>\\s*(?:<b>)?([^<]*)`, 'i').exec(row);
  return match ? match[1].trim() : null;
}

// "14/AUG/26 - 1200" in Argentine local time, which has no daylight saving.
function parseTimestamp(value: string): string | null {
  const match = /^(\d{2})\/([A-Z]{3})\/(\d{2})\s*-\s*(\d{2})(\d{2})$/i.exec(value.trim());
  if (!match) return null;

  const [, day, monthName, year, hour, minute] = match;
  const month = MONTHS[monthName.toUpperCase()];
  if (!month) return null;

  const parsed = Date.parse(`20${year}-${month}-${day}T${hour}:${minute}:00-03:00`);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function parseTrend(state: string | null): Trend {
  const normalized = (state ?? '').toUpperCase();
  if (normalized.startsWith('CRECE')) return 'rising';
  if (normalized.startsWith('BAJA')) return 'falling';
  return 'stable';
}

export function parseRiverIndex(html: string): IndexReading[] {
  const readings: IndexReading[] = [];
  const rowPattern = /<tr class="[^"]*"\s*>([\s\S]*?)<\/tr>/gi;

  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(html)) !== null) {
    const row = match[1];

    const code = /[?&]id=(\d+)/.exec(row)?.[1];
    const name = field(row, 'Puerto:');
    const river = field(row, 'Río:');
    if (!code || !name || !river) continue;

    const level = Number.parseFloat(field(row, 'Ultimo Registro:') ?? '');
    if (!Number.isFinite(level)) continue;

    const timestamp = parseTimestamp(field(row, 'Fecha Hora:') ?? '');
    if (!timestamp) continue;

    const variation = Number.parseFloat(field(row, 'Variacion') ?? '');

    readings.push({
      code,
      name,
      river,
      level,
      trend: parseTrend(field(row, 'Estado:')),
      // Stored in centimetres, matching what the per-station scraper produces.
      changeRate: Number.isFinite(variation) ? variation * 100 : 0,
      timestamp,
    });
  }

  return readings;
}

export async function fetchRiverIndex(fetchFn: typeof fetch = fetch): Promise<IndexReading[]> {
  const res = await fetchFn(PNA_INDEX_URL, {
    headers: { Accept: 'text/html', 'User-Agent': 'ParanaInfo-Server/1.0' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseRiverIndex(await res.text());
}
