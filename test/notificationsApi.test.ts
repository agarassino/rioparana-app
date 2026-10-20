// test/notificationsApi.test.ts
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock('../src/services/api/authedFetch', () => ({ authedFetch: mocks.authedFetch }));

import { getNotificationHistory, registerPushToken } from '../src/services/api/backend';

const TOKEN = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const ok = (rows: unknown) => new Response(JSON.stringify(rows), { status: 200 });

beforeEach(() => { mocks.authedFetch.mockReset(); });

describe('registerPushToken', () => {
  test('sends the token as this device, with no deviceId', async () => {
    mocks.authedFetch.mockResolvedValue(new Response(null, { status: 204 }));

    await registerPushToken(TOKEN);

    expect(mocks.authedFetch).toHaveBeenCalledWith('/me/push-token', { method: 'PUT', body: { pushToken: TOKEN } });
  });

  test('sends null to turn notifications off', async () => {
    mocks.authedFetch.mockResolvedValue(new Response(null, { status: 204 }));
    await registerPushToken(null);
    expect(mocks.authedFetch).toHaveBeenCalledWith('/me/push-token', { method: 'PUT', body: { pushToken: null } });
  });

  test('never throws, because this runs on app start', async () => {
    mocks.authedFetch.mockRejectedValue(new Error('boom'));
    await expect(registerPushToken(TOKEN)).resolves.toBeUndefined();
  });
});

describe('getNotificationHistory', () => {
  test('asks for this device history', async () => {
    mocks.authedFetch.mockResolvedValue(ok([]));
    await getNotificationHistory();
    expect(mocks.authedFetch).toHaveBeenCalledWith('/me/notifications');
  });

  test('returns what it was given', async () => {
    const row = { id: '1', stationId: 'rosario', title: 'Rosario · 2.54 m', body: 'Subió 6 cm.', sentAt: '2026-09-15T10:00:00.000Z' };
    mocks.authedFetch.mockResolvedValue(ok([row]));
    expect(await getNotificationHistory()).toEqual([row]);
  });

  test('drops rows that are not a notification', async () => {
    mocks.authedFetch.mockResolvedValue(ok([
      { id: '1', stationId: 'rosario', title: 'T', body: 'B', sentAt: '2026-09-15T10:00:00.000Z' },
      { id: '2', title: 'sin fecha', body: 'B' },
    ]));
    expect(await getNotificationHistory()).toHaveLength(1);
  });

  test('returns an empty list without a token or network', async () => {
    mocks.authedFetch.mockResolvedValue(null);
    expect(await getNotificationHistory()).toEqual([]);
  });

  test('returns an empty list when the API errors', async () => {
    mocks.authedFetch.mockResolvedValue(new Response('{}', { status: 500 }));
    expect(await getNotificationHistory()).toEqual([]);
  });
});
