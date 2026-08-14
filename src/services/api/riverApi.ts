import { WaterLevel } from '../../types';
import { getStationById } from '../../config/stations';
import { getBackendLevel, pushBackendLevels } from './backend';
import { fetchAllLevels } from './riverIndex';

// One scrape of the PNA index covers every station, so opening a second
// station costs nothing and the shared cache gets the whole set at once.
const INDEX_CACHE_MS = 10 * 60 * 1000;

let cachedLevels: WaterLevel[] | null = null;
let cachedAt = 0;

async function getIndexLevels(): Promise<WaterLevel[]> {
  const now = Date.now();
  if (cachedLevels && now - cachedAt < INDEX_CACHE_MS) return cachedLevels;

  const levels = await fetchAllLevels();
  if (levels.length > 0) {
    cachedLevels = levels;
    cachedAt = now;
    // Populate the shared cache without delaying the current request.
    pushBackendLevels(levels);
  }
  return levels;
}

export async function getCurrentWaterLevel(stationId: string): Promise<WaterLevel | null> {
  if (!getStationById(stationId)) return null;

  const levels = await getIndexLevels();
  const scraped = levels.find((level) => level.stationId === stationId);
  if (scraped) return scraped;

  // PNA is unreachable from foreign IPs, and it does not publish every station
  // every day. Either way the shared cache answers.
  return getBackendLevel(stationId);
}


export function calculateFishingCondition(level: WaterLevel): 'optimal' | 'good' | 'regular' | 'poor' {
  const { trend, changeRate } = level;

  if (trend === 'rising' && Math.abs(changeRate) > 10) return 'poor';
  if (trend === 'falling' && Math.abs(changeRate) > 10) return 'regular';
  if (trend === 'stable' || Math.abs(changeRate) < 3) return 'optimal';
  return 'good';
}
