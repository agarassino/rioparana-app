import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { apiKeyGuard } from '../../src/middleware/apiKey.js';

function appWithGuard() {
  const app = Fastify();
  app.addHook('preHandler', apiKeyGuard('secret'));
  app.get('/protected', async () => ({ ok: true }));
  return app;
}

describe('apiKeyGuard', () => {
  it('rejects without key', async () => {
    const app = appWithGuard();
    const res = await app.inject({ method: 'GET', url: '/protected' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('allows with correct key', async () => {
    const app = appWithGuard();
    const res = await app.inject({ method: 'GET', url: '/protected', headers: { 'x-api-key': 'secret' } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
