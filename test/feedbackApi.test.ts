// test/feedbackApi.test.ts
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock('../src/services/api/authedFetch', () => ({ authedFetch: mocks.authedFetch }));

import { addMessage, createThread, getThread, listThreads } from '../src/services/api/feedbackApi';

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const INFO = { appVersion: '2.2.0', osVersion: 'android 34' };
const message = { id: 'm1', author: 'device', body: 'Hola', createdAt: '2026-10-13T12:00:00.000Z' };
const summary = {
  id: ID, kind: 'bug', stationId: 'rosario', status: 'open', unread: false, preview: 'Hola',
  createdAt: '2026-10-13T12:00:00.000Z', updatedAt: '2026-10-13T12:00:00.000Z',
};
const detail = { ...summary, messages: [message] };
const res = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

beforeEach(() => { mocks.authedFetch.mockReset(); });

describe('createThread', () => {
  test('posts the thread with the app and OS version', async () => {
    mocks.authedFetch.mockResolvedValue(res(201, detail));

    const result = await createThread({ kind: 'bug', body: 'Hola', stationId: 'rosario' }, INFO);

    expect(result).toEqual({ ok: true, data: detail });
    expect(mocks.authedFetch).toHaveBeenCalledWith('/feedback', {
      method: 'POST',
      body: { kind: 'bug', body: 'Hola', stationId: 'rosario', appVersion: '2.2.0', osVersion: 'android 34' },
    });
  });

  test('treats the 200 of a deduplicated retry as success', async () => {
    mocks.authedFetch.mockResolvedValue(res(200, detail));
    expect((await createThread({ kind: 'bug', body: 'Hola' }, INFO)).ok).toBe(true);
  });

  test.each([
    [null, 'offline'],
    [res(429, { error: 'limit', limit: 'threads' }), 'limit'],
    [res(400, { error: 'invalid', field: 'body' }), 'invalid'],
    [res(500, { error: 'internal' }), 'unavailable'],
    [res(201, { not: 'a thread' }), 'unavailable'],
  ])('maps %o to %s', async (response, reason) => {
    mocks.authedFetch.mockResolvedValue(response);
    expect(await createThread({ kind: 'bug', body: 'Hola' }, INFO)).toEqual({ ok: false, reason });
  });
});

describe('listThreads', () => {
  test('returns the summaries and drops malformed rows', async () => {
    mocks.authedFetch.mockResolvedValue(res(200, [summary, { id: 'x' }]));
    expect(await listThreads()).toEqual({ ok: true, data: [summary] });
    expect(mocks.authedFetch).toHaveBeenCalledWith('/feedback');
  });
});

describe('getThread', () => {
  test('returns one thread', async () => {
    mocks.authedFetch.mockResolvedValue(res(200, detail));
    expect(await getThread(ID)).toEqual({ ok: true, data: detail });
    expect(mocks.authedFetch).toHaveBeenCalledWith(`/feedback/${ID}`);
  });

  test('reports a thread that is gone', async () => {
    mocks.authedFetch.mockResolvedValue(res(404, { error: 'not_found' }));
    expect(await getThread(ID)).toEqual({ ok: false, reason: 'not_found' });
  });

  test('does not call the API for an id that cannot exist', async () => {
    expect(await getThread('../../stats')).toEqual({ ok: false, reason: 'not_found' });
    expect(mocks.authedFetch).not.toHaveBeenCalled();
  });
});

describe('addMessage', () => {
  test('posts the body to the thread', async () => {
    mocks.authedFetch.mockResolvedValue(res(201, message));
    expect(await addMessage(ID, 'Hola')).toEqual({ ok: true, data: message });
    expect(mocks.authedFetch).toHaveBeenCalledWith(`/feedback/${ID}/messages`, { method: 'POST', body: { body: 'Hola' } });
  });
});

test('unexpected transport failures become results instead of losing the draft', async () => {
 mocks.authedFetch.mockRejectedValue(new Error('unexpected'));
 await expect(createThread({ kind: 'bug', body: 'draft' }, INFO)).resolves.toEqual({ ok: false, reason: 'offline' });
 await expect(listThreads()).resolves.toEqual({ ok: false, reason: 'offline' });
 await expect(getThread(ID)).resolves.toEqual({ ok: false, reason: 'offline' });
 await expect(addMessage(ID, 'draft')).resolves.toEqual({ ok: false, reason: 'offline' });
});
