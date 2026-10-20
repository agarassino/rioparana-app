// server/test/services/ownerEmail.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Pool } from 'pg';
import { memPool } from '../helpers/memPool.js';
import { A } from '../helpers/devices.js';
import { registerDevice } from '../../src/stores/deviceTokenStore.js';
import { addMessage, createThread } from '../../src/stores/feedbackStore.js';
import { ownerEmailConfigFromEnv, runOwnerEmailTick, type OwnerEmailConfig } from '../../src/services/ownerEmail.js';

const T0 = new Date('2026-10-13T12:00:00.000Z');
const MIN = 60_000;
const at = (ms: number) => new Date(T0.getTime() + ms);
let pool: Pool;

beforeEach(async () => {
  pool = await memPool();
  await registerDevice(pool, A, 'h', T0);
});

const resend = (status = 200) => vi.fn(async (_u: string | URL | Request, _i?: RequestInit) => new Response('{"id":"x"}', { status }));
const config = (fetchFn: ReturnType<typeof resend>): OwnerEmailConfig => ({
  apiKey: 're_test',
  to: 'garassino@gmail.com',
  from: 'Paraná Info <avisos@rioparana.com.ar>',
  adminBaseUrl: 'http://100.89.213.31:3100',
  fetchFn: fetchFn as unknown as typeof fetch,
});
const sent = (fetchFn: ReturnType<typeof resend>, call = 0) => JSON.parse(String(fetchFn.mock.calls[call][1]?.body));
const newThread = (body: string, when: Date, stationId: string | null = 'rosario') =>
  createThread(pool, { deviceId: A, kind: 'bug', body, stationId, appVersion: '2.2.0', osVersion: 'android 34' }, when);

describe('runOwnerEmailTick', () => {
  it('sends nothing when there is nothing new', async () => {
    const fetchFn = resend();
    expect(await runOwnerEmailTick(pool, config(fetchFn), T0)).toEqual({ status: 'nothing_new', messages: 0 });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('sends one plain-text email for new device messages', async () => {
    const t = await newThread('El nivel de Rosario está mal', T0);
    await addMessage(pool, t.id, 'device', 'Y no actualiza', at(MIN));
    const fetchFn = resend();

    expect(await runOwnerEmailTick(pool, config(fetchFn), at(5 * MIN))).toEqual({ status: 'sent', messages: 2 });

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer re_test');
    const body = sent(fetchFn);
    expect(body).toMatchObject({ from: 'Paraná Info <avisos@rioparana.com.ar>', to: ['garassino@gmail.com'], subject: 'Paraná Info: 2 mensaje(s) nuevo(s)' });
    expect(body.html).toBeUndefined();
    expect(body.text).toContain('[Error] Rosario · 2 mensaje(s)');
    expect(body.text).toContain('El nivel de Rosario está mal');
    expect(body.text).toContain(`http://100.89.213.31:3100/admin/threads/${t.id}`);
  });

  it('ignores the owner own replies', async () => {
    const t = await newThread('Hola', T0);
    await runOwnerEmailTick(pool, config(resend()), at(MIN));
    await addMessage(pool, t.id, 'admin', 'Respuesta', at(20 * MIN));

    expect((await runOwnerEmailTick(pool, config(resend()), at(40 * MIN))).status).toBe('nothing_new');
  });

  it('waits 15 minutes after an email before sending the next', async () => {
    await newThread('primero', T0);
    await runOwnerEmailTick(pool, config(resend()), at(MIN));
    await newThread('segundo', at(2 * MIN));
    const fetchFn = resend();

    expect(await runOwnerEmailTick(pool, config(fetchFn), at(6 * MIN))).toEqual({ status: 'debounced', messages: 1 });
    expect(await runOwnerEmailTick(pool, config(fetchFn), at(16 * MIN))).toEqual({ status: 'sent', messages: 1 });
    expect(sent(fetchFn).text).toContain('segundo');
    expect(sent(fetchFn).text).not.toContain('primero');
  });

  it('keeps the mark when Resend fails, and retries on the next tick', async () => {
    await newThread('no se pierde', T0);
    const down = resend(503);
    const up = resend();

    expect((await runOwnerEmailTick(pool, config(down), at(5 * MIN))).status).toBe('failed');
    expect(await runOwnerEmailTick(pool, config(up), at(10 * MIN))).toEqual({ status: 'sent', messages: 1 });
  });

  it('treats a network error as a failed send', async () => {
    await newThread('x', T0);
    const offline = vi.fn(async () => { throw new Error('ENOTFOUND api.resend.com'); });
    const cfg = { ...config(resend()), fetchFn: offline as unknown as typeof fetch };
    expect((await runOwnerEmailTick(pool, cfg, at(MIN))).status).toBe('failed');
  });

  it('sends one email after six hours of failures, capped at 20 threads', async () => {
    for (let i = 0; i < 25; i++) await newThread(`hilo ${i}`, at(i * 1000));
    const down = resend(500);
    for (let tick = 1; tick <= 72; tick++) await runOwnerEmailTick(pool, config(down), at(tick * 5 * MIN));
    const up = resend();

    expect(await runOwnerEmailTick(pool, config(up), at(73 * 5 * MIN))).toEqual({ status: 'sent', messages: 25 });
    expect(up).toHaveBeenCalledTimes(1);
    const text = sent(up).text as string;
    expect(sent(up).subject).toBe('Paraná Info: 25 mensaje(s) nuevo(s)');
    expect(text.match(/\/admin\/threads\//g)).toHaveLength(20);
    expect(text).toContain('…y 5 conversación(es) más');
  });

  it('cuts each preview at 140 characters and names a missing station', async () => {
    await newThread('😀'.repeat(150), T0, null);
    const fetchFn = resend();
    await runOwnerEmailTick(pool, config(fetchFn), at(MIN));
    const text = sent(fetchFn).text as string;
    expect(text).toContain('😀'.repeat(140) + '…');
    expect(text).not.toContain('😀'.repeat(141));
    expect(text).toContain('[Error] Sin estación');
  });
});

describe('ownerEmailConfigFromEnv', () => {
  const env = { resendApiKey: 're_x', feedbackNotifyEmail: 'garassino@gmail.com', feedbackFromEmail: 'Paraná Info <avisos@rioparana.com.ar>', adminBaseUrl: 'http://100.89.213.31:3100' };

  it('is disabled without an API key', () => {
    expect(ownerEmailConfigFromEnv({ ...env, resendApiKey: null })).toBeNull();
  });

  it('carries the env values otherwise', () => {
    expect(ownerEmailConfigFromEnv(env)).toEqual({ apiKey: 're_x', to: 'garassino@gmail.com', from: 'Paraná Info <avisos@rioparana.com.ar>', adminBaseUrl: 'http://100.89.213.31:3100' });
  });
});

describe('exact-message email acknowledgement', () => {
  it.each([0, -1000])('keeps an insert during send pending even at timestamp offset %s', async (offset) => {
    await newThread('selected first', T0);
    const fetchFn = vi.fn(async () => {
      await newThread('committed during send', at(offset));
      return new Response('{"id":"first"}', { status: 200 });
    });
    expect(await runOwnerEmailTick(pool, { ...config(resend()), fetchFn: fetchFn as typeof fetch }, at(MIN))).toEqual({ status: 'sent', messages: 1 });
    const next = resend();
    expect(await runOwnerEmailTick(pool, config(next), at(20 * MIN))).toEqual({ status: 'sent', messages: 1 });
    expect(sent(next).text).toContain('committed during send');
    expect(sent(next).text).not.toContain('selected first');
    expect((await runOwnerEmailTick(pool, config(resend()), at(40 * MIN))).status).toBe('nothing_new');
  });

  it('does not acknowledge selected or concurrently inserted messages on failure', async () => {
    await newThread('before failure', T0);
    const fetchFn = vi.fn(async () => {
      await newThread('during failure', T0);
      return new Response('{}', { status: 503 });
    });
    expect((await runOwnerEmailTick(pool, { ...config(resend()), fetchFn: fetchFn as typeof fetch }, at(MIN))).status).toBe('failed');
    expect(await runOwnerEmailTick(pool, config(resend()), at(2 * MIN))).toEqual({ status: 'sent', messages: 2 });
  });
});
