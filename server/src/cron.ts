import cron from 'node-cron';
import type { Pool } from 'pg';
import { STATIONS } from './config/stations.js';
import { fetchWaterLevel } from './scrapers/river.js';
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

export function startCron(pool: Pool): void {
  cron.schedule('*/15 * * * *', () => {
    refreshRiver(pool).catch((e) => console.error('[cron] river run error', e));
    refreshNews(pool).catch((e) => console.error('[cron] news run error', e));
  });
}
