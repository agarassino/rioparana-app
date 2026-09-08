import { afterEach, describe, expect, test, vi } from 'vitest';
import { getBackendHistory } from '../src/services/api/backend';

afterEach(() => vi.unstubAllGlobals());

const ok = (rows: unknown) =>
  vi.fn(async () => ({ ok: true, json: async () => rows }));

describe('getBackendHistory', () => {
  test('asks the public endpoint for the station, with no key', async () => {
    // The heights are public information, so this read carries no credential
    // and works even if the key in the bundle is stale.
    const fetchMock = ok([]);
    vi.stubGlobal('fetch', fetchMock);

    await getBackendHistory('rosario');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/public/river/rosario/history');
    expect(JSON.stringify(init?.headers ?? {})).not.toContain('api-key');
  });

  test('returns the readings it was given', async () => {
    vi.stubGlobal('fetch', ok([{ timestamp: '2026-09-07T15:00:00.000Z', level: 2.42 }]));

    expect(await getBackendHistory('rosario')).toEqual([
      { timestamp: '2026-09-07T15:00:00.000Z', level: 2.42 },
    ]);
  });

  test('drops rows that are not a reading', async () => {
    // A malformed row would enter the chart as a level of zero and flatten it.
    vi.stubGlobal('fetch', ok([
      { timestamp: '2026-09-07T15:00:00.000Z', level: 2.42 },
      { timestamp: 'no es una fecha', level: 3 },
      { timestamp: '2026-09-07T21:00:00.000Z', level: null },
      { level: 3 },
    ]));

    expect(await getBackendHistory('rosario')).toHaveLength(1);
  });

  test('returns an empty list rather than throwing when the API errors', async () => {
    // A screen must degrade to "no chart yet", never to a crash.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => null })));
    expect(await getBackendHistory('rosario')).toEqual([]);
  });

  test('returns an empty list when the request fails outright', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await getBackendHistory('rosario')).toEqual([]);
  });

  test('returns an empty list when the body is not a list', async () => {
    vi.stubGlobal('fetch', ok({ error: 'nope' }));
    expect(await getBackendHistory('rosario')).toEqual([]);
  });
});
