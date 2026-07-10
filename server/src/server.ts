import Fastify, { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import type { Pool } from 'pg';
import { registerRoutes } from './routes/index.js';
import { apiKeyGuard } from './middleware/apiKey.js';

export interface BuildServerOptions {
  pool?: Pool;
  apiKey?: string;
  weatherDeps?: { fetchFn?: typeof fetch };
  rateLimit?: boolean;
}

export async function buildServer(opts: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  if (opts.rateLimit) {
    await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  }

  app.get('/health', async () => ({ status: 'ok' }));
  if (opts.apiKey) app.addHook('preHandler', apiKeyGuard(opts.apiKey));
  if (opts.pool) registerRoutes(app, { pool: opts.pool, weatherDeps: opts.weatherDeps });

  return app;
}
