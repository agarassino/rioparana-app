// server/test/routes/legacy.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { buildServer } from '../../src/server.js';
import { memPool } from '../helpers/memPool.js';
import { A, H, KEY, registerToken, bearer } from '../helpers/devices.js';

let pool: Pool;
beforeEach(async () => {
  pool = await memPool();
});

const calls = [
  { method: 'POST' as const, url: '/devices/ping', payload: { deviceId: A } },
  { method: 'POST' as const, url: '/devices/push-token', payload: { deviceId: A, pushToken: null } },
  { method: 'GET' as const, url: `/notifications?deviceId=${A}` },
];

describe('legacy device routes', () => {
  it.each(calls)('keep working by default: $method $url', async (call) => {
    const a = await buildServer({ pool, apiKey: KEY });
    const res = await a.inject({ ...call, headers: H });
    expect(res.statusCode).toBeLessThan(300);
    await a.close();
  });

  it.each(calls)('answer 410 once switched off: $method $url', async (call) => {
    const a = await buildServer({ pool, apiKey: KEY, legacyDeviceRoutes: false });
    const res = await a.inject({ ...call, headers: H });
    expect(res.statusCode).toBe(410);
    expect(res.json()).toEqual({ error: 'gone' });
    await a.close();
  });
});

describe('upgraded device legacy protection', () => {
  it.each(calls)('rejects legacy access after registration: $method $url', async (call) => {
    const a = await buildServer({ pool, apiKey: KEY });
    const token = await registerToken(a, A);
    await a.inject({ method: 'PUT', url: '/me/push-token', headers: bearer(token), payload: { pushToken: 'ExponentPushToken[owner]' } });
    const res = await a.inject({ ...call, headers: H });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'invalid_token' });
    const stored = await pool.query('SELECT push_token FROM devices WHERE device_id = $1', [A]);
    expect(stored.rows[0].push_token).toBe('ExponentPushToken[owner]');
    expect((await a.inject({ method: 'POST', url: '/devices/register', headers: H, payload: { deviceId: A } })).statusCode).toBe(409);
    await a.close();
  });
});
