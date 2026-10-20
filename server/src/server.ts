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
  // Fastify 5 treats a numeric trustProxy as hop-count-only trust and fails
  // it closed (cannot validate the immediate peer, so it never trusts
  // forwarded headers) — `trustProxy: 1` stopped type-checking for exactly
  // that reason. In production Traefik reaches this container over the
  // private Docker network, so the immediate peer is always one of these
  // ranges; a connection arriving directly from a public address is NOT
  // trusted (its own socket address is used, forwarded headers are
  // ignored), which is what stops a client from spoofing X-Forwarded-For to
  // fake another IP. This keeps the per-IP rate limiter (see
  // `opts.rateLimit` below) keyed on the real client, not Traefik's address.
  const app = Fastify({ logger: false, trustProxy: 'loopback, linklocal, uniquelocal' });

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
