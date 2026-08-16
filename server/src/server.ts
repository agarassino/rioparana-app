import Fastify, { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import type { Pool } from 'pg';
import { registerRoutes } from './routes/index.js';
import { apiKeyGuard } from './middleware/apiKey.js';

export interface BuildServerOptions {
  pool?: Pool;
  apiKey?: string;
  weatherDeps?: { fetchFn?: typeof fetch };
  refreshFetch?: typeof fetch;
  refreshToken?: string;
  rateLimit?: boolean;
}

export async function buildServer(opts: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, trustProxy: 1 });

  if (opts.rateLimit) {
    await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  }

  app.get('/health', async () => ({ status: 'ok' }));

  // The public read is meant to be consumed from a browser on another origin,
  // such as the landing page. Only that prefix is opened; everything else
  // stays same-origin and behind the key.
  app.addHook('onSend', async (req, reply, payload) => {
    if (req.url.split('?')[0].startsWith('/public/')) {
      reply.header('Access-Control-Allow-Origin', '*');
    }
    return payload;
  });

  if (opts.apiKey) app.addHook('preHandler', apiKeyGuard(opts.apiKey));
  if (opts.pool)
    registerRoutes(app, {
      pool: opts.pool,
      weatherDeps: opts.weatherDeps,
      refreshFetch: opts.refreshFetch,
      refreshToken: opts.refreshToken,
    });

  return app;
}
