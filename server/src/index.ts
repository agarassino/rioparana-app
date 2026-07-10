import { loadEnv } from './config/env.js';
import { createPool, runMigrations } from './db/index.js';
import { buildServer } from './server.js';
import { startCron, refreshRiver, refreshNews } from './cron.js';

async function main() {
  const env = loadEnv();
  const pool = createPool(env.databaseUrl);
  await runMigrations(pool);

  // Warm the caches once at boot so the API has data immediately.
  await Promise.allSettled([refreshRiver(pool), refreshNews(pool)]);
  startCron(pool);

  const app = await buildServer({ pool, apiKey: env.apiKey, rateLimit: true });
  await app.listen({ port: env.port, host: '0.0.0.0' });
  console.log(`[server] listening on ${env.port}`);
}

main().catch((err) => {
  console.error('[server] fatal', err);
  process.exit(1);
});
