import { describe, it, expect } from 'vitest';
import { buildServer } from '../src/server.js';

// Test-only route: the real routes never need to read request.ip today, but
// production's rate limiter (opts.rateLimit) keys on it, so trustProxy's
// resolution of the real client IP behind Traefik is load-bearing.
async function appWithIpRoute() {
  const app = await buildServer();
  app.get('/__test/ip', async (request) => ({ ip: request.ip }));
  return app;
}

describe('client IP resolution (trustProxy)', () => {
  it('trusts X-Forwarded-For from the Docker-network proxy hop', async () => {
    const app = await appWithIpRoute();
    const res = await app.inject({
      method: 'GET',
      url: '/__test/ip',
      remoteAddress: '10.0.1.2',
      headers: { 'x-forwarded-for': '203.0.113.7' },
    });
    expect(res.json()).toEqual({ ip: '203.0.113.7' });
    await app.close();
  });

  it('ignores a spoofed private left-side entry and still recovers the real client', async () => {
    const app = await appWithIpRoute();
    const res = await app.inject({
      method: 'GET',
      url: '/__test/ip',
      remoteAddress: '10.0.1.2',
      headers: { 'x-forwarded-for': '10.9.9.9, 203.0.113.7' },
    });
    expect(res.json()).toEqual({ ip: '203.0.113.7' });
    await app.close();
  });

  it('does not trust a direct public connection, even with a forwarded header', async () => {
    const app = await appWithIpRoute();
    const res = await app.inject({
      method: 'GET',
      url: '/__test/ip',
      remoteAddress: '198.51.100.20',
      headers: { 'x-forwarded-for': '203.0.113.7' },
    });
    expect(res.json()).toEqual({ ip: '198.51.100.20' });
    await app.close();
  });
});
