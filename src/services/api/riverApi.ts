import { WaterLevel } from '../../types';
import { getStationById } from '../../config/stations';
import { getBackendLevel, pushBackendLevel } from './backend';

// Prefectura Naval Argentina - Alturas de ríos
const PNA_BASE_URL = 'https://contenidosweb.prefecturanaval.gob.ar/alturas';

// Parsear HTML de Prefectura Naval para extraer nivel del río
function parseWaterLevel(html: string, stationId: string): WaterLevel | null {
  try {
    // La tabla tiene formato:
    // <td><i class="fa fa-calendar"></i> 2026-01-16 <i class="fa fa-clock-o"></i> 00:00</td>
    // <td>2.77 Mts</td>

    // Extraer todas las fechas y niveles por separado
    const datePattern = /<td[^>]*><i[^>]*><\/i>\s*(\d{4}-\d{2}-\d{2})\s*<i[^>]*><\/i>\s*(\d{2}:\d{2})<\/td>/gi;
    const levelPattern = /<td[^>]*>(\d+\.?\d*)\s*Mts<\/td>/gi;

    const dates: { date: string; time: string }[] = [];
    const levels: number[] = [];

    let dateMatch;
    while ((dateMatch = datePattern.exec(html)) !== null) {
      dates.push({ date: dateMatch[1], time: dateMatch[2] });
    }

    let levelMatch;
    while ((levelMatch = levelPattern.exec(html)) !== null) {
      levels.push(parseFloat(levelMatch[1]));
    }

    if (dates.length === 0 || levels.length === 0) {
      console.log('Could not extract dates or levels from PNA HTML');
      return null;
    }

    // El primer par es el más reciente
    const currentLevel = levels[0];
    const timestamp = new Date(`${dates[0].date}T${dates[0].time}:00`);

    let trend: 'rising' | 'falling' | 'stable' = 'stable';
    let changeRate = 0;

    if (levels.length > 1) {
      const previousLevel = levels[1];
      const diff = currentLevel - previousLevel;
      changeRate = diff * 100; // cm por período

      if (diff > 0.02) trend = 'rising';
      else if (diff < -0.02) trend = 'falling';
    }

    return {
      stationId,
      timestamp,
      level: currentLevel,
      trend,
      changeRate,
    };
  } catch (error) {
    console.log('Error parsing water level HTML:', error);
    return null;
  }
}

// PNA (Prefectura) only responds from Argentine residential IPs and can hang
// indefinitely from abroad. A hard timeout guarantees this call always resolves
// so the UI never gets stuck on a loading spinner. When PNA is unreachable
// (e.g. Google review from a foreign IP) we fall back to the backend cache,
// which is kept fresh by pushes from users' phones inside Argentina.
const PNA_TIMEOUT_MS = 5000;

export async function getCurrentWaterLevel(stationId: string): Promise<WaterLevel | null> {
  const station = getStationById(stationId);
  if (!station) return null;

  const url = `${PNA_BASE_URL}/?page=historico&tiempo=7&id=${station.code}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PNA_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/html',
        'User-Agent': 'ParanaInfo-App/1.0',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const level = parseWaterLevel(html, stationId);

    if (level) {
      console.log(`✅ PNA data for ${stationId}:`, level.level, 'm', level.trend);
      // Populate the shared backend cache so users abroad still see a value.
      pushBackendLevel(level);
      return level;
    }

    // Parsing failed: fall back to the last cached value.
    console.log('Could not parse PNA data, trying backend for', stationId);
    return await getBackendLevel(stationId);
  } catch (error: any) {
    // Timeout, abort, network error or foreign-IP block: use the cache.
    console.log('❌ PNA API Error, using backend cache:', {
      stationId,
      message: error?.message,
    });
    return await getBackendLevel(stationId);
  } finally {
    clearTimeout(timeout);
  }
}

export function calculateFishingCondition(level: WaterLevel): 'optimal' | 'good' | 'regular' | 'poor' {
  const { trend, changeRate } = level;

  if (trend === 'rising' && Math.abs(changeRate) > 10) return 'poor';
  if (trend === 'falling' && Math.abs(changeRate) > 10) return 'regular';
  if (trend === 'stable' || Math.abs(changeRate) < 3) return 'optimal';
  return 'good';
}
