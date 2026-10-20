// server/test/routes/feedback.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { buildServer } from '../../src/server.js';
import { memPool } from '../helpers/memPool.js';
import { A, B, H, KEY, bearer, registerToken } from '../helpers/devices.js';
import { addMessage } from '../../src/stores/feedbackStore.js';

const T0 = new Date('2026-10-13T12:00:00.000Z');
const MIN = 60_000;
const HOUR = 60 * MIN;
let pool: Pool;
let clock: Date;

beforeEach(async () => {
  pool = await memPool();
  clock = T0;
});

const app = () => buildServer({ pool, apiKey: KEY, now: () => clock });
const advance = (ms: number) => { clock = new Date(clock.getTime() + ms); };
const thread = (over: Record<string, unknown> = {}) => ({
  kind: 'bug', body: 'El nivel de Rosario está mal', stationId: 'rosario',
  appVersion: '2.2.0', osVersion: 'android 34', ...over,
});
const post = (a: FastifyInstance, token: string, payload: unknown) =>
  a.inject({ method: 'POST', url: '/feedback', headers: bearer(token), payload: payload as never });
const reply = (a: FastifyInstance, token: string, id: string, body: string) =>
  a.inject({ method: 'POST', url: `/feedback/${id}/messages`, headers: bearer(token), payload: { body } });

describe('POST /feedback', () => {
  it('creates a thread with its first message', async () => {
    const a = await app();
    const token = await registerToken(a, A);

    const res = await post(a, token, thread());

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ kind: 'bug', stationId: 'rosario', status: 'open', unread: false });
    expect(res.json().messages).toEqual([expect.objectContaining({ author: 'device', body: 'El nivel de Rosario está mal' })]);
    await a.close();
  });

  it('needs a device token', async () => {
    const a = await app();
    const res = await a.inject({ method: 'POST', url: '/feedback', headers: H, payload: thread() });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'invalid_token' });
    await a.close();
  });

  it('accepts 2000 emoji and rejects a NUL byte', async () => {
    const a = await app();
    const token = await registerToken(a, A);

    expect((await post(a, token, thread({ body: '😀'.repeat(2000) }))).statusCode).toBe(201);
    const nul = await post(a, token, thread({ body: 'a\u0000b' }));
    expect(nul.statusCode).toBe(400);
    expect(nul.json()).toEqual({ error: 'invalid', field: 'body' });
    await a.close();
  });

  it('names the field without echoing the input', async () => {
    const a = await app();
    const token = await registerToken(a, A);

    const res = await post(a, token, thread({ stationId: '<img src=x onerror=alert(1)>' }));

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'invalid', field: 'stationId' });
    expect(res.body).not.toContain('onerror');
    await a.close();
  });

  it('a retried POST returns the first thread instead of a second one', async () => {
    const a = await app();
    const token = await registerToken(a, A);
    const first = await post(a, token, thread());
    advance(10_000);

    const retry = await post(a, token, thread());

    expect(retry.statusCode).toBe(200);
    expect(retry.json().id).toBe(first.json().id);
    const list = await a.inject({ method: 'GET', url: '/feedback', headers: bearer(token) });
    expect(list.json()).toHaveLength(1);
    await a.close();
  });
});

describe('limits', () => {
  it('allows 5 new threads per rolling 24 h and frees a slot exactly 24 h later', async () => {
    const a = await app();
    const token = await registerToken(a, A);
    for (let i = 0; i < 5; i++) expect((await post(a, token, thread({ body: `hilo ${i}` }))).statusCode).toBe(201);

    const sixth = await post(a, token, thread({ body: 'hilo 6' }));
    expect(sixth.statusCode).toBe(429);
    expect(sixth.json()).toEqual({ error: 'limit', limit: 'threads' });

    advance(24 * HOUR - 1);
    expect((await post(a, token, thread({ body: 'hilo 7' }))).statusCode).toBe(429);
    advance(1);
    expect((await post(a, token, thread({ body: 'hilo 8' }))).statusCode).toBe(201);
    await a.close();
  });

  it('allows 30 device messages per rolling 24 h, first messages included', async () => {
    const a = await app();
    const token = await registerToken(a, A);
    const id = (await post(a, token, thread())).json().id as string;
    for (let i = 0; i < 29; i++) expect((await reply(a, token, id, `mensaje ${i}`)).statusCode).toBe(201);

    const over = await reply(a, token, id, 'uno más');
    expect(over.statusCode).toBe(429);
    expect(over.json()).toEqual({ error: 'limit', limit: 'messages' });
    expect((await post(a, token, thread({ body: 'otro hilo' }))).json()).toEqual({ error: 'limit', limit: 'messages' });
    await a.close();
  });

  it('keeps each device on its own budget', async () => {
    const a = await app();
    const tokenA = await registerToken(a, A);
    const tokenB = await registerToken(a, B);
    for (let i = 0; i < 5; i++) await post(a, tokenA, thread({ body: `hilo ${i}` }));

    expect((await post(a, tokenB, thread())).statusCode).toBe(201);
    await a.close();
  });
});

describe('reading threads', () => {
  it('lists only the device own threads', async () => {
    const a = await app();
    const tokenA = await registerToken(a, A);
    const tokenB = await registerToken(a, B);
    await post(a, tokenA, thread({ body: 'de A' }));
    await post(a, tokenB, thread({ body: 'de B' }));

    const res = await a.inject({ method: 'GET', url: '/feedback', headers: bearer(tokenA) });

    expect(res.json().map((t: { preview: string }) => t.preview)).toEqual(['de A']);
    await a.close();
  });

  it('returns one thread with its messages and clears unread', async () => {
    const a = await app();
    const token = await registerToken(a, A);
    const id = (await post(a, token, thread())).json().id as string;
    await addMessage(pool, id, 'admin', 'Gracias, lo revisamos', clock);

    const listed = await a.inject({ method: 'GET', url: '/feedback', headers: bearer(token) });
    expect(listed.json()[0].unread).toBe(true);

    const res = await a.inject({ method: 'GET', url: `/feedback/${id}`, headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'answered', unread: false });
    expect(res.json().messages.map((m: { author: string }) => m.author)).toEqual(['device', 'admin']);

    const again = await a.inject({ method: 'GET', url: '/feedback', headers: bearer(token) });
    expect(again.json()[0].unread).toBe(false);
    await a.close();
  });

  it('returns 404 for a non-uuid id', async () => {
    const a = await app();
    const token = await registerToken(a, A);
    const res = await a.inject({ method: 'GET', url: '/feedback/not-a-uuid', headers: bearer(token) });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
    await a.close();
  });
});

describe('ownership', () => {
  it('answers 404, never 403, for another device thread, and changes nothing', async () => {
    const a = await app();
    const tokenA = await registerToken(a, A);
    const tokenB = await registerToken(a, B);
    const id = (await post(a, tokenA, thread())).json().id as string;

    const read = await a.inject({ method: 'GET', url: `/feedback/${id}`, headers: bearer(tokenB) });
    const write = await reply(a, tokenB, id, 'me meto');

    expect(read.statusCode).toBe(404);
    expect(read.json()).toEqual({ error: 'not_found' });
    expect(write.statusCode).toBe(404);
    const own = await a.inject({ method: 'GET', url: `/feedback/${id}`, headers: bearer(tokenA) });
    expect(own.json().messages).toHaveLength(1);
    await a.close();
  });
});

describe('POST /feedback/:id/messages', () => {
  it('adds a message and reopens an answered thread', async () => {
    const a = await app();
    const token = await registerToken(a, A);
    const id = (await post(a, token, thread())).json().id as string;
    await addMessage(pool, id, 'admin', 'Respuesta', clock);
    advance(MIN);

    const res = await reply(a, token, id, 'Sigue igual');

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ author: 'device', body: 'Sigue igual' });
    const t = await a.inject({ method: 'GET', url: `/feedback/${id}`, headers: bearer(token) });
    expect(t.json().status).toBe('open');
    await a.close();
  });

  it('a retried message returns the first one', async () => {
    const a = await app();
    const token = await registerToken(a, A);
    const id = (await post(a, token, thread())).json().id as string;
    const first = await reply(a, token, id, 'dos veces');

    const retry = await reply(a, token, id, 'dos veces');

    expect(retry.statusCode).toBe(200);
    expect(retry.json().id).toBe(first.json().id);
    await a.close();
  });
});

describe('device write rate limit', () => {
  it('limits writes to 60 per minute independently for each device', async () => {
    const a = await buildServer({ pool, apiKey: KEY, rateLimit: true });
    const token = await registerToken(a, A);
    const other = await registerToken(a, B);
    for (let i = 0; i < 60; i++) {
      expect((await a.inject({ method: 'POST', url: '/me/ping', headers: bearer(token), payload: {} })).statusCode).toBe(204);
    }
    expect((await a.inject({ method: 'POST', url: '/me/ping', headers: bearer(token), payload: {} })).statusCode).toBe(429);
    expect((await a.inject({ method: 'POST', url: '/me/ping', headers: bearer(other), payload: {} })).statusCode).toBe(204);
    await a.close();
  });
});
