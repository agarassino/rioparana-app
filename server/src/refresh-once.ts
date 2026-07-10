import { createPool, runMigrations } from './db/index.js';
import { refreshRiver, refreshNews } from './cron.js';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const pool = createPool(databaseUrl);
  await runMigrations(pool);
  const [river, news] = await Promise.allSettled([refreshRiver(pool), refreshNews(pool)]);
  console.log('[refresh] river:', JSON.stringify(river));
  console.log('[refresh] news:', JSON.stringify(news));
  await pool.end();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[refresh] fatal', err);
    process.exit(1);
  });
