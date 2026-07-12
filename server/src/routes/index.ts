import { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { getWaterLevel } from '../stores/riverStore.js';
import { getNews } from '../stores/newsStore.js';
import { pingDevice } from '../stores/deviceStore.js';
import { getWeather } from '../services/weatherService.js';
import { getStationById } from '../config/stations.js';
import { refreshRiver, refreshNews } from '../cron.js';

export interface RouteDeps {
  pool: Pool;
  weatherDeps?: { fetchFn?: typeof fetch };
  refreshFetch?: typeof fetch;
}

const weatherQuery = z.object({ lat: z.coerce.number(), lon: z.coerce.number() });
const pingBody = z.object({ deviceId: z.string().uuid(), stationId: z.string().optional() });

export function registerRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const { pool } = deps;

  app.get('/river/:stationId', async (req, reply) => {
    const { stationId } = req.params as { stationId: string };
    if (!getStationById(stationId)) return reply.code(404).send({ error: 'unknown station' });
    const level = await getWaterLevel(pool, stationId);
    if (!level) return reply.code(404).send({ error: 'no data yet' });
    return level;
  });

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

  app.post('/refresh', async () => {
    const [river, news] = await Promise.all([
      refreshRiver(pool, { fetchFn: deps.refreshFetch }),
      refreshNews(pool, { fetchFn: deps.refreshFetch }),
    ]);
    return { river, news };
  });
}
