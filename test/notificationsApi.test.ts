import { afterEach, describe, expect, test, vi } from 'vitest';
import { getNotificationHistory, registerPushToken } from '../src/services/api/backend';

afterEach(() => vi.unstubAllGlobals());

const DEVICE = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const ok = (rows: unknown) => vi.fn(async () => ({ ok: true, json: async () => rows }));

describe('registerPushToken', () => {
  test('sends the device and its token', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);

    await registerPushToken(DEVICE, TOKEN);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/devices/push-token');
    expect(JSON.parse(String(init.body))).toEqual({ deviceId: DEVICE, pushToken: TOKEN });
  });

  test('sends null to turn notifications off', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);

    await registerPushToken(DEVICE, null);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).pushToken).toBeNull();
  });

  test('never throws, because this runs on app start', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));

    await expect(registerPushToken(DEVICE, TOKEN)).resolves.toBeUndefined();
  });
});

describe('getNotificationHistory', () => {
  test('asks for this device history', async () => {
    const fetchMock = ok([]);
    vi.stubGlobal('fetch', fetchMock);

    await getNotificationHistory(DEVICE);

    expect(String((fetchMock.mock.calls as unknown as string[][])[0][0])).toContain(`/notifications?deviceId=${DEVICE}`);
  });

  test('returns what it was given', async () => {
    const row = {
      id: '1', stationId: 'rosario', title: 'Rosario · 2.54 m',
      body: 'Subió 6 cm.', sentAt: '2026-09-15T10:00:00.000Z',
    };
    vi.stubGlobal('fetch', ok([row]));

    expect(await getNotificationHistory(DEVICE)).toEqual([row]);
  });

  test('drops rows that are not a notification', async () => {
    // A malformed row would render as an empty card the reader cannot act on.
    vi.stubGlobal('fetch', ok([
      { id: '1', stationId: 'rosario', title: 'T', body: 'B', sentAt: '2026-09-15T10:00:00.000Z' },
      { id: '2', title: 'sin fecha', body: 'B' },
      { id: '3', stationId: 'goya', title: 'T', body: 'B', sentAt: 'no es una fecha' },
    ]));

    expect(await getNotificationHistory(DEVICE)).toHaveLength(1);
  });

  test('returns an empty list rather than throwing when the API errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => null })));

    expect(await getNotificationHistory(DEVICE)).toEqual([]);
  });

  test('returns an empty list when the body is not a list', async () => {
    vi.stubGlobal('fetch', ok({ error: 'nope' }));

    expect(await getNotificationHistory(DEVICE)).toEqual([]);
  });
});
