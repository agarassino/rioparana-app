// server/test/routes/me.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { buildServer } from '../../src/server.js';
import { memPool } from '../helpers/memPool.js';
import { A, B, H, KEY, bearer, registerToken } from '../helpers/devices.js';
import { recordNotification, savePushToken, subscribers } from '../../src/stores/pushStore.js';

const PUSH_A = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const PUSH_B = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';
let pool: Pool;
beforeEach(async () => {
  pool = await memPool();
});
const app = () => buildServer({ pool, apiKey: KEY });

describe('GET /me/notifications', () => {
  it("returns only the token's own history", async () => {
    const a = await app();
    const token = await registerToken(a, A);
    await recordNotification(pool, A, 'rosario', 'Mine', 'b');
    await recordNotification(pool, B, 'goya', 'Theirs', 'b');

    const res = await a.inject({ method: 'GET', url: `/me/notifications?deviceId=${B}`, headers: bearer(token) });

    expect(res.statusCode).toBe(200);
    expect(res.json().map((n: { title: string }) => n.title)).toEqual(['Mine']);
    await a.close();
  });

  it('needs a token, not just the api key', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: '/me/notifications', headers: H });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'invalid_token' });
    await a.close();
  });
});

describe('PUT /me/push-token', () => {
  it('writes to the token device and ignores a deviceId in the body', async () => {
    const a = await app();
    const token = await registerToken(a, A);
    await savePushToken(pool, B, PUSH_B);

    const res = await a.inject({
      method: 'PUT', url: '/me/push-token', headers: bearer(token),
      payload: { deviceId: B, pushToken: PUSH_A },
    });

    expect(res.statusCode).toBe(204);
    const subs = await subscribers(pool);
    expect(subs.find((s) => s.deviceId === A)?.pushToken).toBe(PUSH_A);
    expect(subs.find((s) => s.deviceId === B)?.pushToken).toBe(PUSH_B);
    await a.close();
  });

  it('accepts null to turn notifications off', async () => {
    const a = await app();
    const token = await registerToken(a, A);
    const res = await a.inject({ method: 'PUT', url: '/me/push-token', headers: bearer(token), payload: { pushToken: null } });
    expect(res.statusCode).toBe(204);
    await a.close();
  });

  it('rejects a token that is not an Expo one', async () => {
    const a = await app();
    const token = await registerToken(a, A);
    const res = await a.inject({ method: 'PUT', url: '/me/push-token', headers: bearer(token), payload: { pushToken: 'hello' } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'invalid', field: 'pushToken' });
    await a.close();
  });
});

describe('POST /me/ping', () => {
  it('records the station view against the token device', async () => {
    const a = await app();
    const token = await registerToken(a, A);

    const res = await a.inject({ method: 'POST', url: '/me/ping', headers: bearer(token), payload: { deviceId: B, stationId: 'rosario' } });

    expect(res.statusCode).toBe(204);
    const views = await pool.query('SELECT device_id FROM device_station_views');
    expect(views.rows.map((r) => String(r.device_id))).toEqual([A]);
    await a.close();
  });
});
