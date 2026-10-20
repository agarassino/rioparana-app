// server/test/adminIsolation.test.ts
import { describe, it, expect } from 'vitest';
import { buildServer } from '../src/server.js';
import { buildAdminServer } from '../src/admin/server.js';
import { memPool } from './helpers/memPool.js';
import { H, KEY } from './helpers/devices.js';

describe('admin isolation', () => {
  it('the public instance does not serve the admin, with or without the key', async () => {
    const app = await buildServer({ pool: await memPool(), apiKey: KEY });

    const withKey = await app.inject({ method: 'GET', url: '/admin/login', headers: H });
    const without = await app.inject({ method: 'GET', url: '/admin/login' });

    expect(withKey.statusCode).toBe(404);
    expect(without.statusCode).toBe(401);
    await app.close();
  });

  it('the admin instance does not serve the public API', async () => {
    const admin = await buildAdminServer({ pool: await memPool(), passwordHash: '$argon2id$x' });

    for (const url of ['/health', '/news', '/public/river']) {
      expect((await admin.inject({ method: 'GET', url })).statusCode).toBe(404);
    }
    expect((await admin.inject({ method: 'POST', url: '/devices/register', payload: {} })).statusCode).toBe(404);
    await admin.close();
  });
});
