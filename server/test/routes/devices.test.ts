// server/test/routes/devices.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { buildServer } from '../../src/server.js';
import { memPool } from '../helpers/memPool.js';
import { A, H, KEY } from '../helpers/devices.js';
import { pingDevice } from '../../src/stores/deviceStore.js';

let pool: Pool;
beforeEach(async () => {
  pool = await memPool();
});

const app = (rateLimit = false) => buildServer({ pool, apiKey: KEY, rateLimit });
const register = (a: Awaited<ReturnType<typeof app>>, deviceId: unknown) =>
  a.inject({ method: 'POST', url: '/devices/register', headers: H, payload: { deviceId } as never });

describe('POST /devices/register', () => {
  it('returns a token once and stores only its hash', async () => {
    const a = await app();
    const res = await register(a, A);

    expect(res.statusCode).toBe(201);
    const { token } = res.json();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const row = await pool.query('SELECT token_hash FROM devices WHERE device_id = $1', [A]);
    expect(row.rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.rows[0].token_hash).not.toBe(token);
    await a.close();
  });

  it('upgrades a device that pinged on an older version', async () => {
    await pingDevice(pool, A, 'rosario');
    const a = await app();
    expect((await register(a, A)).statusCode).toBe(201);
    await a.close();
  });

  it('refuses to hand out a second token for the same device', async () => {
    const a = await app();
    await register(a, A);

    const res = await register(a, A);

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'already_registered' });
    await a.close();
  });

  it('rejects a deviceId that is not a uuid, naming the field', async () => {
    const a = await app();
    const res = await register(a, '<script>');
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'invalid', field: 'deviceId' });
    await a.close();
  });

  it('stays behind the api key', async () => {
    const a = await app();
    const res = await a.inject({ method: 'POST', url: '/devices/register', payload: { deviceId: A } });
    expect(res.statusCode).toBe(401);
    await a.close();
  });

  it('limits registrations to 10 an hour per IP', async () => {
    const a = await app(true);
    for (let i = 0; i < 10; i++) expect((await register(a, randomUUID())).statusCode).toBe(201);

    expect((await register(a, randomUUID())).statusCode).toBe(429);
    await a.close();
  });
});
