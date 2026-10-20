// server/test/admin/server.test.ts
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import type { Pool } from 'pg';
import { memPool } from '../helpers/memPool.js';
import { A } from '../helpers/devices.js';
import { PASSWORD, cookieHeader, csrfFrom, login, postForm, session } from '../helpers/admin.js';
import { buildAdminServer } from '../../src/admin/server.js';
import { hashPassword } from '../../src/admin/password.js';
import { registerDevice } from '../../src/stores/deviceTokenStore.js';
import { savePushToken } from '../../src/stores/pushStore.js';
import { createThread } from '../../src/stores/feedbackStore.js';
import { getThreadForAdmin } from '../../src/stores/feedbackAdminStore.js';
import { listAudit } from '../../src/stores/adminAudit.js';

const PUSH = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const MIN = 60_000;
let passwordHash: string;
let pool: Pool;
let now: number;
let pushFetch: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  pool = await memPool();
  now = Date.parse('2026-10-13T12:00:00.000Z');
  pushFetch = vi.fn(async () => new Response(JSON.stringify({ data: [{ status: 'ok' }] }), { status: 200 }));
  await registerDevice(pool, A, 'h');
});

const admin = (over: Partial<Parameters<typeof buildAdminServer>[0]> = {}) =>
  buildAdminServer({ pool, passwordHash, clock: () => now, pushFetch: pushFetch as unknown as typeof fetch, ...over });

const newThread = (body = '¿Hay datos de Goya?') =>
  createThread(pool, { deviceId: A, kind: 'question', body, stationId: 'goya', appVersion: '2.2.0', osVersion: 'android 34' }, new Date(now));

describe('login', () => {
  it('serves the login page with a CSRF cookie scoped to /admin', async () => {
    const a = await admin();
    const res = await a.inject({ method: 'GET', url: '/admin/login' });

    expect(res.statusCode).toBe(200);
    expect(csrfFrom(res.body)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const c = res.cookies.find((x) => x.name === 'admin_login_csrf');
    expect(c).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/admin' });
    await a.close();
  });

  it('signs in with the right password and sets a strict session cookie', async () => {
    const a = await admin();
    const res = await login(a);

    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toBe('/admin');
    const c = res.cookies.find((x) => x.name === 'admin_session');
    expect(c).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/admin', maxAge: 43200 });
    expect(c?.secure).toBeFalsy();
    expect((await listAudit(pool)).map((e) => e.action)).toEqual(['login']);
    await a.close();
  });

  it('adds Secure when served over HTTPS', async () => {
    const a = await admin({ secureCookie: true });
    const res = await login(a);
    expect(res.cookies.find((x) => x.name === 'admin_session')?.secure).toBe(true);
    await a.close();
  });

  it('refuses a wrong password and audits it', async () => {
    const a = await admin();
    const res = await login(a, 'wrong');

    expect(res.statusCode).toBe(401);
    expect(res.body).toContain('Contraseña incorrecta.');
    expect(res.cookies.find((x) => x.name === 'admin_session')).toBeUndefined();
    expect((await listAudit(pool)).map((e) => e.action)).toEqual(['login_failed']);
    await a.close();
  });

  it('locks the account for 15 minutes after 5 failures, even for the right password', async () => {
    const a = await admin();
    for (let i = 0; i < 5; i++) expect((await login(a, 'wrong')).statusCode).toBe(401);

    const locked = await login(a);
    expect(locked.statusCode).toBe(429);
    expect(locked.body).toContain('Demasiados intentos');
    expect(locked.cookies.find((x) => x.name === 'admin_session')).toBeUndefined();

    now += 15 * MIN;
    expect((await login(a)).statusCode).toBe(303);
    await a.close();
  });

  it('answers 404 to a login without its CSRF token', async () => {
    const a = await admin();
    const page = await a.inject({ method: 'GET', url: '/admin/login' });

    const res = await postForm(a, '/admin/login', cookieHeader(page), { password: PASSWORD, _csrf: 'forged' });

    expect(res.statusCode).toBe(404);
    expect(res.cookies.find((x) => x.name === 'admin_session')).toBeUndefined();
    await a.close();
  });
});

describe('sessions', () => {
  it('expires after 12 hours', async () => {
    const a = await admin();
    const { cookie } = await session(a);
    now += 12 * 3600_000;
    expect((await a.inject({ method: 'GET', url: '/admin', headers: { cookie } })).statusCode).toBe(404);
    await a.close();
  });

  it('ends on logout', async () => {
    const a = await admin();
    const { cookie, csrf } = await session(a);

    const out = await postForm(a, '/admin/logout', cookie, { _csrf: csrf });

    expect(out.statusCode).toBe(303);
    expect((await a.inject({ method: 'GET', url: '/admin', headers: { cookie } })).statusCode).toBe(404);
    await a.close();
  });
});

describe('uniform 404', () => {
  it('gives unknown, unauthorised and malformed paths the same answer', async () => {
    const a = await admin();
    const t = await newThread();
    const { cookie } = await session(a);

    const responses = await Promise.all([
      a.inject({ method: 'GET', url: '/admin' }),
      a.inject({ method: 'GET', url: `/admin/threads/${t.id}` }),
      a.inject({ method: 'GET', url: '/admin/nope', headers: { cookie } }),
      a.inject({ method: 'GET', url: '/admin/threads/not-a-uuid', headers: { cookie } }),
      a.inject({ method: 'GET', url: '/admin/threads/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', headers: { cookie } }),
      a.inject({ method: 'GET', url: '/' }),
    ]);

    for (const r of responses) {
      expect(r.statusCode).toBe(404);
      expect(r.body).toBe(responses[0].body);
    }
    await a.close();
  });
});

describe('headers', () => {
  it.each(['/admin/login', '/admin/nope'])('sets the security headers on %s', async (url) => {
    const a = await admin();
    const res = await a.inject({ method: 'GET', url });
    expect(res.headers['content-security-policy']).toBe("default-src 'self'");
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    await a.close();
  });
});
