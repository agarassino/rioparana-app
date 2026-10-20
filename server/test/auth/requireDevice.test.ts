// server/test/auth/requireDevice.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { Pool } from 'pg';
import { memPool } from '../helpers/memPool.js';
import { A } from '../helpers/devices.js';
import { requireDevice } from '../../src/auth/requireDevice.js';
import { issueToken } from '../../src/auth/deviceToken.js';
import { registerDevice } from '../../src/stores/deviceTokenStore.js';

let pool: Pool;
beforeEach(async () => {
  pool = await memPool();
});

function guarded() {
  const app = Fastify();
  app.decorateRequest('deviceId', null);
  app.get('/who', { preHandler: requireDevice(pool) }, async (req) => ({ deviceId: req.deviceId }));
  return app;
}

describe('requireDevice', () => {
  it('resolves the device from its token', async () => {
    const { token, hash } = issueToken();
    await registerDevice(pool, A, hash);
    const app = guarded();

    const res = await app.inject({ method: 'GET', url: '/who', headers: { authorization: `Bearer ${token}` } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ deviceId: A });
    await app.close();
  });

  it.each([
    ['no header', {}],
    ['malformed header', { authorization: 'Bearer nope' }],
    ['unknown token', { authorization: `Bearer ${'a'.repeat(43)}` }],
  ])('answers 401 invalid_token for %s', async (_label, headers) => {
    const app = guarded();
    const res = await app.inject({ method: 'GET', url: '/who', headers });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'invalid_token' });
    await app.close();
  });

  it('answers 401, not 500, when the token is valid but its device row is gone', async () => {
    const { token, hash } = issueToken();
    await registerDevice(pool, A, hash);
    await pool.query('DELETE FROM devices WHERE device_id = $1', [A]);
    const app = guarded();

    const res = await app.inject({ method: 'GET', url: '/who', headers: { authorization: `Bearer ${token}` } });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'invalid_token' });
    await app.close();
  });
});
