// server/test/stores/feedbackAdminStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { memPool } from '../helpers/memPool.js';
import { A, B } from '../helpers/devices.js';
import { registerDevice } from '../../src/stores/deviceTokenStore.js';
import { addMessage, createThread, type FeedbackKind } from '../../src/stores/feedbackStore.js';
import { listAudit } from '../../src/stores/adminAudit.js';
import { archiveThread, getThreadForAdmin, listInbox, replyAsAdmin } from '../../src/stores/feedbackAdminStore.js';

const T0 = new Date('2026-10-13T12:00:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);
let pool: Pool;

beforeEach(async () => {
  pool = await memPool();
  await registerDevice(pool, A, 'ha', T0);
  await registerDevice(pool, B, 'hb', T0);
});

const make = (body: string, kind: FeedbackKind = 'suggestion', deviceId = A, when = T0) =>
  createThread(pool, { deviceId, kind, body, stationId: 'rosario', appVersion: '2.2.0', osVersion: 'android 34' }, when);

describe('listInbox', () => {
  it('splits threads into the four filters', async () => {
    const open = await make('abierto', 'suggestion', A, at(1));
    const answered = await make('respondido', 'question', A, at(2));
    await addMessage(pool, answered.id, 'admin', 'ok', at(3));
    const archived = await make('archivado', 'bug', A, at(4));
    await archiveThread(pool, archived.id, at(5));
    const bug = await make('error abierto', 'bug', B, at(6));

    const ids = async (f: Parameters<typeof listInbox>[1]) => (await listInbox(pool, f)).map((r) => r.id);
    expect(await ids('pending')).toEqual([bug.id, open.id]);
    expect(await ids('answered')).toEqual([answered.id]);
    expect(await ids('archived')).toEqual([archived.id]);
    expect(await ids('errors')).toEqual([bug.id]);
  });

  it('shows a preview and a short device id, never the full one', async () => {
    await make('😀'.repeat(150));
    const [row] = await listInbox(pool, 'pending');
    expect(row.preview).toBe('😀'.repeat(140) + '…');
    expect(row.shortDevice).toBe(A.slice(0, 8));
  });
});

describe('getThreadForAdmin', () => {
  it('returns the thread with its device context', async () => {
    const t = await make('primero');
    await make('segundo');

    const detail = await getThreadForAdmin(pool, t.id);

    expect(detail).toMatchObject({
      id: t.id, kind: 'suggestion', stationId: 'rosario', status: 'open',
      appVersion: '2.2.0', osVersion: 'android 34', shortDevice: A.slice(0, 8), deviceThreadCount: 2,
    });
    expect(detail?.messages.map((m) => m.body)).toEqual(['primero']);
  });

  it('returns null for an unknown thread', async () => {
    expect(await getThreadForAdmin(pool, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBeNull();
  });
});

describe('replyAsAdmin', () => {
  it('stores the reply, marks the thread answered and unread, and audits it', async () => {
    const t = await make('pregunta');

    expect(await replyAsAdmin(pool, t.id, 'respuesta', at(1000))).toBe('sent');

    const detail = await getThreadForAdmin(pool, t.id);
    expect(detail?.status).toBe('answered');
    expect(detail?.messages.at(-1)).toMatchObject({ author: 'admin', body: 'respuesta' });
    const unread = await pool.query('SELECT unread_device FROM feedback_threads WHERE id = $1', [t.id]);
    expect(unread.rows[0].unread_device).toBe(true);
    expect(await listAudit(pool)).toEqual([{ action: 'reply', threadId: t.id, at: at(1000).toISOString() }]);
  });

  it('stores a double-submitted reply once', async () => {
    const t = await make('pregunta');
    await replyAsAdmin(pool, t.id, 'respuesta', at(1000));

    expect(await replyAsAdmin(pool, t.id, 'respuesta', at(2000))).toBe('duplicate');
    expect((await getThreadForAdmin(pool, t.id))?.messages).toHaveLength(2);
    expect(await listAudit(pool)).toHaveLength(1);
  });

  it('reports an unknown thread', async () => {
    expect(await replyAsAdmin(pool, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'x')).toBe('not_found');
  });
});

describe('archiveThread', () => {
  it('archives without replying and audits it', async () => {
    const t = await make('ruido');
    expect(await archiveThread(pool, t.id, at(1))).toBe(true);
    expect((await getThreadForAdmin(pool, t.id))?.status).toBe('archived');
    expect((await listAudit(pool)).map((e) => e.action)).toEqual(['archive']);
  });

  it('reports an unknown thread without auditing', async () => {
    expect(await archiveThread(pool, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe(false);
    expect(await listAudit(pool)).toEqual([]);
  });
});
