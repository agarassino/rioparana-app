import { describe, it, expect } from 'vitest';
import type { Pool } from 'pg';
import { buildServer } from '../src/server.js';
import { memPool } from './helpers/memPool.js';

const KEY = 'secret';
const H = { 'x-api-key': KEY };

function capture() {
  const lines: string[] = [];
  return { lines, stream: { write: (m: string) => { lines.push(m); } } };
}

describe('logging', () => {
  it('redacts credentials wherever they appear in a log line', async () => {
    const { lines, stream } = capture();
    const app = await buildServer({ logger: { level: 'info', stream } });

    app.log.info(
      {
        req: { headers: { authorization: 'Bearer SECRET_BEARER', 'x-api-key': 'SECRET_KEY', 'x-refresh-token': 'SECRET_REFRESH', cookie: 'admin_session=SECRET_COOKIE' } },
        body: { token: 'SECRET_TOKEN', password: 'SECRET_PW', pushToken: 'SECRET_PUSH' },
        token: 'SECRET_TOKEN2',
      },
      'probe',
    );

    const out = lines.join('');
    expect(out).toContain('probe');
    expect(out).toContain('[redacted]');
    expect(out).not.toMatch(/SECRET_/);
    await app.close();
  });
});

describe('errors', () => {
  it('logs a 5xx and answers with a generic body', async () => {
    const { lines, stream } = capture();
    const failing = { query: async () => { throw new Error('connect db-internal-host:5432 refused'); } } as unknown as Pool;
    const app = await buildServer({ pool: failing, apiKey: KEY, logger: { level: 'info', stream } });

    const res = await app.inject({ method: 'GET', url: '/news', headers: H });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'internal' });
    expect(lines.join('')).toContain('db-internal-host');
    await app.close();
  });

  it('does not echo a malformed JSON body back', async () => {
    const app = await buildServer({ pool: await memPool(), apiKey: KEY });

    const res = await app.inject({
      method: 'POST', url: '/devices/ping',
      headers: { ...H, 'content-type': 'application/json' },
      payload: '{"deviceId": <script>',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'invalid' });
    expect(res.body).not.toContain('script');
    await app.close();
  });
});

describe('body limit', () => {
  it('refuses bodies over 16 KB', async () => {
    const app = await buildServer({ pool: await memPool(), apiKey: KEY });

    const res = await app.inject({
      method: 'POST', url: '/devices/ping', headers: H,
      payload: { deviceId: '11111111-1111-4111-8111-111111111111', stationId: 'x'.repeat(17 * 1024) },
    });

    expect(res.statusCode).toBe(413);
    expect(res.json()).toEqual({ error: 'too_large' });
    await app.close();
  });

  it('still accepts a full 200-reading crowd batch on POST /river', async () => {
    const app = await buildServer({ pool: await memPool(), apiKey: KEY });
    const reading = {
      stationId: 'rosario', level: 3.14, trend: 'stable', changeRate: 0,
      timestamp: new Date().toISOString(), alertLevel: 5.3, evacuationLevel: 5.8,
    };

    const res = await app.inject({
      method: 'POST', url: '/river', headers: H,
      payload: { readings: Array.from({ length: 200 }, () => reading) },
    });

    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
