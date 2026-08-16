import type { Pool } from 'pg';
import { STATIONS, getStationByCode } from './config/stations.js';
import { fetchWaterLevel } from './scrapers/river.js';
import { fetchRiverIndex } from './scrapers/riverIndex.js';
import { fetchNews } from './scrapers/news.js';
import { upsertWaterLevel } from './stores/riverStore.js';
import { replaceNews } from './stores/newsStore.js';

export async function refreshRiver(pool: Pool, deps: { fetchFn?: typeof fetch } = {}): Promise<{ updated: number }> {
  let updated = 0;
  for (const station of STATIONS) {
    try {
      const wl = await fetchWaterLevel(station, deps.fetchFn);
      if (wl) {
        await upsertWaterLevel(pool, wl);
        updated++;
      }
    } catch (err) {
      console.error(`[cron] river ${station.id} failed:`, (err as Error).message);
    }
  }
  return { updated };
}

// One request covers every station, so this replaces the per-station loop above
// wherever the origin is reachable. Readings for ports the app does not list
// are ignored.
export async function refreshRiverFromIndex(
  pool: Pool,
  deps: { fetchFn?: typeof fetch } = {}
): Promise<{ updated: number }> {
  let updated = 0;
  try {
    const readings = await fetchRiverIndex(deps.fetchFn);
    for (const reading of readings) {
      const station = getStationByCode(reading.code);
      if (!station) continue;
      try {
        await upsertWaterLevel(pool, {
          stationId: station.id,
          level: reading.level,
          trend: reading.trend,
          changeRate: reading.changeRate,
          timestamp: reading.timestamp,
          alertLevel: reading.alertLevel,
          evacuationLevel: reading.evacuationLevel,
        });
        updated++;
      } catch (err) {
        console.error(`[cron] river ${station.id} store failed:`, (err as Error).message);
      }
    }
  } catch (err) {
    console.error('[cron] river index failed:', (err as Error).message);
  }
  return { updated };
}

export async function refreshNews(pool: Pool, deps: { fetchFn?: typeof fetch } = {}): Promise<{ updated: number }> {
  try {
    const items = await fetchNews(deps.fetchFn);
    if (items.length > 0) {
      await replaceNews(pool, items);
      return { updated: items.length };
    }
  } catch (err) {
    console.error('[cron] news failed:', (err as Error).message);
  }
  return { updated: 0 };
}
