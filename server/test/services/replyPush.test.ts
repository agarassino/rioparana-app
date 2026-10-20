// server/test/services/replyPush.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Pool } from 'pg';
import { memPool } from '../helpers/memPool.js';
import { A } from '../helpers/devices.js';
import { registerDevice } from '../../src/stores/deviceTokenStore.js';
import { savePushToken, subscribers } from '../../src/stores/pushStore.js';
import { addMessage, createThread } from '../../src/stores/feedbackStore.js';
import { notifyReply } from '../../src/services/replyPush.js';

const PUSH = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const SECRET_REPLY = 'RESPUESTA PRIVADA DEL DUEÑO';
let pool: Pool;
let threadId: string;

beforeEach(async () => {
  pool = await memPool();
  await registerDevice(pool, A, 'h');
  const t = await createThread(pool, { deviceId: A, kind: 'question', body: '¿Hay datos de Goya?', stationId: null, appVersion: '2.2.0', osVersion: 'android 34' });
  threadId = t.id;
  await addMessage(pool, threadId, 'admin', SECRET_REPLY);
});

const expo = (ticket: unknown, status = 200) =>
  vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    new Response(JSON.stringify({ data: [ticket] }), { status }));

describe('notifyReply', () => {
  it('announces the reply without ever carrying its text', async () => {
    await savePushToken(pool, A, PUSH);
    const fetchFn = expo({ status: 'ok' });

    expect(await notifyReply(pool, threadId, { fetchFn: fetchFn as unknown as typeof fetch })).toBe('ok');

    const [, init] = fetchFn.mock.calls[0];
    const sent = JSON.parse(String(init?.body));
    expect(sent).toEqual([{
      to: PUSH,
      title: 'Paraná Info',
      body: 'Tenés una respuesta a tu mensaje',
      data: { type: 'feedback_reply', threadId },
    }]);
    expect(String(init?.body)).not.toContain(SECRET_REPLY);
  });

  it('does nothing when the device has no push token', async () => {
    const fetchFn = expo({ status: 'ok' });
    expect(await notifyReply(pool, threadId, { fetchFn: fetchFn as unknown as typeof fetch })).toBe('no_token');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('clears a token Expo says is no longer registered', async () => {
    await savePushToken(pool, A, PUSH);
    const fetchFn = expo({ status: 'error', details: { error: 'DeviceNotRegistered' } });

    expect(await notifyReply(pool, threadId, { fetchFn: fetchFn as unknown as typeof fetch })).toBe('device_not_registered');
    expect(await subscribers(pool)).toEqual([]);
  });

  it('reports failure, without throwing, when Expo is down', async () => {
    await savePushToken(pool, A, PUSH);
    const down = vi.fn(async () => new Response('bad gateway', { status: 502 }));
    const offline = vi.fn(async () => { throw new Error('ECONNRESET'); });

    expect(await notifyReply(pool, threadId, { fetchFn: down as unknown as typeof fetch })).toBe('failed');
    expect(await notifyReply(pool, threadId, { fetchFn: offline as unknown as typeof fetch })).toBe('failed');
  });

  it('treats an unknown thread as having nobody to notify', async () => {
    expect(await notifyReply(pool, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe('no_token');
  });
});
