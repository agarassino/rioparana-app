import { buildAdminServer } from './admin/server.js';
// server/src/index.ts
import { loadEnv } from './config/env.js';
import { createPool } from './db/index.js';
import { prepareDatabase } from './db/startup.js';
import { buildServer } from './server.js';
import { refreshAll, startRefreshScheduler } from './scheduler.js';
import { startFeedbackJobs } from './feedbackScheduler.js';
import { ownerEmailConfigFromEnv, runOwnerEmailTick } from './services/ownerEmail.js';
import { purgeOldThreads } from './services/feedbackRetention.js';

async function main() {
  const env = loadEnv();
  const pool = createPool(env.databaseUrl);
  await prepareDatabase(pool, env.runMigrations);
  const app = await buildServer({
    pool,
    apiKey: env.apiKey,
    rateLimit: true,
    refreshToken: process.env.REFRESH_TOKEN,
    logger: { level: env.logLevel },
    legacyDeviceRoutes: env.legacyDeviceRoutes,
  });
  await app.listen({ port: env.port, host: '0.0.0.0' });
  console.log(`[server] listening on ${env.port}`);
  // warm caches in the background so a slow origin can't block boot / healthcheck
  refreshAll(pool)
    .then(() => console.log('[server] initial cache warm complete'))
    .catch((e) => console.error('[server] cache warm error', e));

  // keep them warm from here on; nothing external drives the refresh
  startRefreshScheduler(pool);
  console.log('[server] refresh scheduler started');

  const emailConfig = ownerEmailConfigFromEnv(env);
  if (!emailConfig) console.log('[feedback] RESEND_API_KEY not set: owner email disabled');
  startFeedbackJobs({
    emailTick: emailConfig ? () => runOwnerEmailTick(pool, emailConfig) : null,
    purge: () => purgeOldThreads(pool),
  });
  console.log('[feedback] jobs started (email every 5 min, purge daily)');

  if (env.adminPasswordHash) {
    const admin = await buildAdminServer({
      pool,
      passwordHash: env.adminPasswordHash,
      secureCookie: env.adminSecureCookie,
      logger: { level: env.logLevel },
    });
    // 0.0.0.0 inside the container; who can reach it is decided by the Docker
    // port mapping, which binds only the tailnet address (DEPLOY-COOLIFY.md §10).
    await admin.listen({ port: env.adminPort, host: '0.0.0.0' });
    console.log(`[admin] listening on ${env.adminPort} (tailnet only)`);
  } else {
    console.log('[admin] ADMIN_PASSWORD_HASH missing or not argon2id: admin disabled');
  }

}

main().catch((err) => {
  console.error('[server] fatal', err);
  process.exit(1);
});
