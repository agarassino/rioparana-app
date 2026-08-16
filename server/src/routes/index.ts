import { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { getAllWaterLevels, getWaterLevel, upsertWaterLevel } from '../stores/riverStore.js';
import { getNews } from '../stores/newsStore.js';
import { pingDevice } from '../stores/deviceStore.js';
import { getWeather } from '../services/weatherService.js';
import { validateIngest } from '../services/riverIngest.js';
import { getStationById } from '../config/stations.js';
import { refreshRiver, refreshNews } from '../cron.js';
import { safeEqual } from '../middleware/apiKey.js';

export interface RouteDeps {
  pool: Pool;
  weatherDeps?: { fetchFn?: typeof fetch };
  refreshFetch?: typeof fetch;
  refreshToken?: string;
}

const weatherQuery = z.object({
  lat: z.coerce.number().finite().min(-90).max(90),
  lon: z.coerce.number().finite().min(-180).max(180),
});
const pingBody = z.object({ deviceId: z.string().uuid(), stationId: z.string().optional() });
// Crowd-sourced river level pushed by phones inside Argentina (the only place
// PNA is reachable). The datacenter cannot scrape PNA itself, so clients ingest.
const riverIngestBody = z.object({
  level: z.number().finite(),
  trend: z.enum(['rising', 'falling', 'stable']),
  changeRate: z.number().finite(),
  timestamp: z.string().datetime(),
  // Reference heights published alongside the reading. Optional so an older
  // client that does not send them still ingests.
  alertLevel: z.number().finite().optional(),
  evacuationLevel: z.number().finite().optional(),
});
// A client that scrapes the index page holds every station at once, so it
// pushes them in one request instead of one per station.
const riverBatchBody = z.object({
  readings: z.array(riverIngestBody.extend({ stationId: z.string().min(1) })).max(200),
});

export function registerRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const { pool } = deps;

  app.get('/river/:stationId', async (req, reply) => {
    const { stationId } = req.params as { stationId: string };
    if (!getStationById(stationId)) return reply.code(404).send({ error: 'unknown station' });
    const level = await getWaterLevel(pool, stationId);
    if (!level) return reply.code(404).send({ error: 'no data yet' });
    return level;
  });

  app.post('/river/:stationId', async (req, reply) => {
    const { stationId } = req.params as { stationId: string };
    if (!getStationById(stationId)) return reply.code(404).send({ error: 'unknown station' });
    const parsed = riverIngestBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });

    // The api key ships in the mobile bundle, so a valid key proves nothing.
    // Reject readings the river could not physically have produced.
    const stored = await getWaterLevel(pool, stationId);
    const rejection = validateIngest(parsed.data, stored, new Date());
    if (rejection) {
      req.log.warn({ stationId, rejection }, 'rejected river ingest');
      return reply.code(422).send({ error: 'implausible reading' });
    }

    await upsertWaterLevel(pool, { stationId, ...parsed.data });
    return reply.code(204).send();
  });

  app.post('/river', async (req, reply) => {
    const parsed = riverBatchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });

    const now = new Date();
    let stored = 0;
    let rejected = 0;

    for (const { stationId, ...reading } of parsed.data.readings) {
      if (!getStationById(stationId)) {
        rejected++;
        continue;
      }
      const current = await getWaterLevel(pool, stationId);
      const rejection = validateIngest(reading, current, now);
      if (rejection) {
        req.log.warn({ stationId, rejection }, 'rejected river ingest');
        rejected++;
        continue;
      }
      await upsertWaterLevel(pool, { stationId, ...reading });
      stored++;
    }

    // One bad reading must not discard the rest of the batch.
    return { stored, rejected };
  });

  // Public, unauthenticated read. The heights come from Prefectura and are
  // public information, so the landing page can show them without shipping a
  // key in its JavaScript.
  app.get('/public/river', async () => getAllWaterLevels(pool));

  app.get('/news', async () => getNews(pool));

  app.get('/weather', async (req, reply) => {
    const parsed = weatherQuery.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid coordinates' });
    return getWeather(pool, parsed.data.lat, parsed.data.lon, deps.weatherDeps);
  });

  app.post('/devices/ping', async (req, reply) => {
    const parsed = pingBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });
    await pingDevice(pool, parsed.data.deviceId, parsed.data.stationId);
    return reply.code(204).send();
  });

  app.post('/refresh', async (req, reply) => {
    if (!deps.refreshToken) return reply.code(404).send({ error: 'not found' });

    const provided = req.headers['x-refresh-token'];
    const token = Array.isArray(provided) ? provided[0] : provided;
    if (!token || !safeEqual(token, deps.refreshToken)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const [river, news] = await Promise.all([
      refreshRiver(pool, { fetchFn: deps.refreshFetch }),
      refreshNews(pool, { fetchFn: deps.refreshFetch }),
    ]);
    return { river, news };
  });
}
