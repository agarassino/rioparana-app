import Fastify, { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { registerRoutes } from './routes/index.js';
import { apiKeyGuard } from './middleware/apiKey.js';

export interface BuildServerOptions {
  pool?: Pool;
  apiKey?: string;
  weatherDeps?: { fetchFn?: typeof fetch };
}

export function buildServer(opts: BuildServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get('/health', async () => ({ status: 'ok' }));

  if (opts.apiKey) app.addHook('preHandler', apiKeyGuard(opts.apiKey));
  if (opts.pool) registerRoutes(app, { pool: opts.pool, weatherDeps: opts.weatherDeps });

  return app;
}
