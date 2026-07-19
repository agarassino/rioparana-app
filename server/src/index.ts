import { loadEnv } from './config/env.js';
import { createPool, runMigrations } from './db/index.js';
import { buildServer } from './server.js';
import { refreshRiver, refreshNews } from './cron.js';

async function main() {
  const env = loadEnv();
  const pool = createPool(env.databaseUrl);
  await runMigrations(pool);
  const app = await buildServer({
    pool,
    apiKey: env.apiKey,
    rateLimit: true,
    refreshToken: process.env.REFRESH_TOKEN,
  });
  await app.listen({ port: env.port, host: '0.0.0.0' });
  console.log(`[server] listening on ${env.port}`);
  // warm caches in the background so a slow origin can't block boot / healthcheck
  Promise.allSettled([refreshRiver(pool), refreshNews(pool)])
    .then(() => console.log('[server] initial cache warm complete'))
    .catch((e) => console.error('[server] cache warm error', e));
}

main().catch((err) => {
  console.error('[server] fatal', err);
  process.exit(1);
});
