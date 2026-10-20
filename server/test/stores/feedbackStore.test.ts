// server/test/stores/feedbackStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { memPool } from '../helpers/memPool.js';
import { A, B } from '../helpers/devices.js';
import { registerDevice } from '../../src/stores/deviceTokenStore.js';
import {
  addMessage, createThread, deviceActivitySince, findDuplicateMessage, findDuplicateThread,
  getThreadForDevice, listThreadsForDevice, ownsThread, preview,
} from '../../src/stores/feedbackStore.js';

const T0 = new Date('2026-10-13T12:00:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);
let pool: Pool;

beforeEach(async () => {
  pool = await memPool();
  await registerDevice(pool, A, 'ha', T0);
  await registerDevice(pool, B, 'hb', T0);
});

const newThread = (deviceId = A, body = 'El nivel está mal') => ({
  deviceId, kind: 'bug' as const, body, stationId: 'rosario', appVersion: '2.2.0', osVersion: 'android 34',
});

describe('createThread', () => {
  it('opens a thread with its first message', async () => {
    const t = await createThread(pool, newThread(), T0);

    expect(t).toMatchObject({ kind: 'bug', stationId: 'rosario', status: 'open', unread: false, preview: 'El nivel está mal' });
    expect(t.messages).toHaveLength(1);
    expect(t.messages[0]).toMatchObject({ author: 'device', body: 'El nivel está mal', createdAt: T0.toISOString() });
  });
});

describe('ownership', () => {
  it('lets a device read only its own thread', async () => {
    const t = await createThread(pool, newThread(A), T0);

    expect(await ownsThread(pool, A, t.id)).toBe(true);
    expect(await ownsThread(pool, B, t.id)).toBe(false);
    expect(await getThreadForDevice(pool, B, t.id)).toBeNull();
  });

  it('lists only the device own threads, newest activity first', async () => {
    const first = await createThread(pool, newThread(A, 'uno'), T0);
    const second = await createThread(pool, newThread(A, 'dos'), at(1000));
    await createThread(pool, newThread(B, 'ajeno'), at(2000));
    await addMessage(pool, first.id, 'device', 'otra vez', at(3000));

    const list = await listThreadsForDevice(pool, A);

    expect(list.map((t) => t.id)).toEqual([first.id, second.id]);
    expect(list[0].preview).toBe('uno');
  });
});

describe('status and unread', () => {
  it('marks an admin reply answered and unread until the device opens it', async () => {
    const t = await createThread(pool, newThread(), T0);
    await addMessage(pool, t.id, 'admin', 'Gracias, lo corregimos', at(1000));

    expect((await listThreadsForDevice(pool, A))[0]).toMatchObject({ status: 'answered', unread: true });
    const opened = await getThreadForDevice(pool, A, t.id, { markRead: true });
    expect(opened?.unread).toBe(false);
    expect((await listThreadsForDevice(pool, A))[0].unread).toBe(false);
  });

  it('reopens an answered thread when the device writes again', async () => {
    const t = await createThread(pool, newThread(), T0);
    await addMessage(pool, t.id, 'admin', 'Respuesta', at(1000));
    await addMessage(pool, t.id, 'device', 'Sigue mal', at(2000));

    expect((await getThreadForDevice(pool, A, t.id))?.status).toBe('open');
  });
});

describe('limits and dedupe', () => {
  it('counts threads and device messages inside the window only', async () => {
    const old = await createThread(pool, newThread(A, 'vieja'), at(-25 * 3600_000));
    await addMessage(pool, old.id, 'device', 'vieja 2', at(-25 * 3600_000));
    const t = await createThread(pool, newThread(A, 'nueva'), T0);
    await addMessage(pool, t.id, 'admin', 'no cuenta', T0);
    await addMessage(pool, t.id, 'device', 'cuenta', T0);

    expect(await deviceActivitySince(pool, A, at(-24 * 3600_000))).toEqual({ threads: 1, messages: 2 });
  });

  it('recognises a retry of the same new thread within a minute', async () => {
    const t = await createThread(pool, newThread(A, 'igual'), T0);

    expect((await findDuplicateThread(pool, A, 'bug', 'igual', at(59_000)))?.id).toBe(t.id);
    expect(await findDuplicateThread(pool, A, 'bug', 'igual', at(61_000))).toBeNull();
    expect(await findDuplicateThread(pool, A, 'question', 'igual', at(1000))).toBeNull();
    expect(await findDuplicateThread(pool, B, 'bug', 'igual', at(1000))).toBeNull();
  });

  it('recognises a retry of the same last message by the same author', async () => {
    const t = await createThread(pool, newThread(), T0);
    const m = await addMessage(pool, t.id, 'admin', 'hola', at(1000));

    expect((await findDuplicateMessage(pool, t.id, 'admin', 'hola', at(2000)))?.id).toBe(m.id);
    expect(await findDuplicateMessage(pool, t.id, 'device', 'hola', at(2000))).toBeNull();
    expect(await findDuplicateMessage(pool, t.id, 'admin', 'hola', at(62_000))).toBeNull();
  });
});

describe('preview', () => {
  it('keeps 140 code points and marks the cut', () => {
    expect(preview('😀'.repeat(141))).toBe('😀'.repeat(140) + '…');
    expect(preview('corto')).toBe('corto');
  });
});
