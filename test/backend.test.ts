import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  getBackendLevel,
  getBackendNews,
  getBackendWeather,
  pingDevice,
  pushBackendLevels,
} from '../src/services/api/backend';

const NEWS_PAYLOAD = [
  { id: '/noticias/uno', title: 'Alerta por bajante', date: '10 de agosto', url: 'https://www.argentina.gob.ar/noticias/uno' },
  { id: '/noticias/dos', title: 'Operativo en el Paraná', date: '9 de agosto', url: 'https://www.argentina.gob.ar/noticias/dos' },
];

const WEATHER_PAYLOAD = {
  latitude: -27.47,
  longitude: -58.83,
  current: {
    temperature: 24,
    feelsLike: 26,
    humidity: 70,
    windSpeed: 12,
    windDirection: 'NE',
    description: 'Parcialmente nublado',
    icon: 'cloud-sun',
    timestamp: '2026-08-12T10:00:00.000Z',
  },
  daily: [
    {
      date: '2026-08-12T03:00:00.000Z',
      tempMax: 28,
      tempMin: 17,
      description: 'Despejado',
      icon: 'sun',
      precipProbability: 10,
    },
  ],
};

function stubFetch(response: unknown, ok = true) {
  const fetchMock = vi.fn(async () => ({
    ok,
    json: async () => response,
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getBackendNews', () => {
  test('returns the news items served by the backend', async () => {
    stubFetch(NEWS_PAYLOAD);

    const news = await getBackendNews();

    expect(news).toEqual(NEWS_PAYLOAD);
  });

  test('requests the /news endpoint with the api key header', async () => {
    const fetchMock = stubFetch(NEWS_PAYLOAD);

    await getBackendNews();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/news$/);
    expect((init.headers as Record<string, string>)['x-api-key']).toBeDefined();
  });

  test('returns an empty list when the backend responds with an error status', async () => {
    stubFetch(NEWS_PAYLOAD, false);

    expect(await getBackendNews()).toEqual([]);
  });

  test('returns an empty list when the payload is not an array', async () => {
    stubFetch({ error: 'boom' });

    expect(await getBackendNews()).toEqual([]);
  });

  test('drops items that are missing required string fields', async () => {
    stubFetch([NEWS_PAYLOAD[0], { id: 42, title: null, url: '' }]);

    expect(await getBackendNews()).toEqual([NEWS_PAYLOAD[0]]);
  });

  test('returns an empty list when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down');
    }));

    expect(await getBackendNews()).toEqual([]);
  });
});

describe('getBackendWeather', () => {
  test('rebuilds timestamps as Date objects', async () => {
    stubFetch(WEATHER_PAYLOAD);

    const weather = await getBackendWeather(-27.47, -58.83);

    expect(weather?.current.timestamp).toBeInstanceOf(Date);
    expect(weather?.current.timestamp.toISOString()).toBe('2026-08-12T10:00:00.000Z');
    expect(weather?.daily[0].date).toBeInstanceOf(Date);
    expect(weather?.daily[0].date.toISOString()).toBe('2026-08-12T03:00:00.000Z');
  });

  test('preserves the numeric weather fields', async () => {
    stubFetch(WEATHER_PAYLOAD);

    const weather = await getBackendWeather(-27.47, -58.83);

    expect(weather?.current.temperature).toBe(24);
    expect(weather?.daily[0].tempMax).toBe(28);
    expect(weather?.daily).toHaveLength(1);
  });

  test('requests the /weather endpoint with the requested coordinates', async () => {
    const fetchMock = stubFetch(WEATHER_PAYLOAD);

    await getBackendWeather(-27.47, -58.83);

    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toContain('/weather?lat=-27.47&lon=-58.83');
  });

  test('returns null when the backend responds with an error status', async () => {
    stubFetch(WEATHER_PAYLOAD, false);

    expect(await getBackendWeather(-27.47, -58.83)).toBeNull();
  });

  test('returns null when the current block is missing', async () => {
    stubFetch({ ...WEATHER_PAYLOAD, current: undefined });

    expect(await getBackendWeather(-27.47, -58.83)).toBeNull();
  });

  test('returns null when a timestamp is not parseable', async () => {
    stubFetch({
      ...WEATHER_PAYLOAD,
      current: { ...WEATHER_PAYLOAD.current, timestamp: 'not-a-date' },
    });

    expect(await getBackendWeather(-27.47, -58.83)).toBeNull();
  });

  test('returns null when the daily forecast is empty', async () => {
    stubFetch({ ...WEATHER_PAYLOAD, daily: [] });

    expect(await getBackendWeather(-27.47, -58.83)).toBeNull();
  });

  test('returns null when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down');
    }));

    expect(await getBackendWeather(-27.47, -58.83)).toBeNull();
  });
});

describe('pushBackendLevels', () => {
  const levels = [
    {
      stationId: 'rosario',
      level: 3,
      trend: 'stable' as const,
      changeRate: 0,
      timestamp: new Date('2026-08-14T15:00:00.000Z'),
    },
    {
      stationId: 'parana',
      level: 2.83,
      trend: 'falling' as const,
      changeRate: -4,
      timestamp: new Date('2026-08-14T15:00:00.000Z'),
    },
  ];

  test('posts the whole batch to the shared cache in one request', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);

    await pushBackendLevels(levels);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/river$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string).readings).toHaveLength(2);
  });

  test('serialises timestamps as ISO strings', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);

    await pushBackendLevels(levels);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).readings[0].timestamp).toBe(
      '2026-08-14T15:00:00.000Z'
    );
  });

  test('does not call the backend for an empty batch', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);

    await pushBackendLevels([]);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('never throws when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down');
    }));

    await expect(pushBackendLevels(levels)).resolves.toBeUndefined();
  });
});

describe('reference levels over the shared cache', () => {
  test('pushBackendLevels forwards the alert and evacuation levels', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);

    await pushBackendLevels([{
      stationId: 'rosario', level: 3, trend: 'stable', changeRate: 0,
      timestamp: new Date('2026-08-14T15:00:00.000Z'), alertLevel: 5, evacuationLevel: 5.3,
    }]);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const reading = JSON.parse(init.body as string).readings[0];
    expect(reading.alertLevel).toBe(5);
    expect(reading.evacuationLevel).toBe(5.3);
  });

  test('getBackendLevel reads them back', async () => {
    stubFetch({
      stationId: 'rosario', level: 3, trend: 'stable', changeRate: 0,
      timestamp: '2026-08-14T15:00:00.000Z', alertLevel: 5, evacuationLevel: 5.3,
    });

    const level = await getBackendLevel('rosario');

    expect(level?.alertLevel).toBe(5);
    expect(level?.evacuationLevel).toBe(5.3);
  });

  test('getBackendLevel still accepts a payload without them', async () => {
    stubFetch({
      stationId: 'rosario', level: 3, trend: 'stable', changeRate: 0,
      timestamp: '2026-08-14T15:00:00.000Z',
    });

    const level = await getBackendLevel('rosario');

    expect(level?.level).toBe(3);
    expect(level?.alertLevel).toBeUndefined();
  });
});

describe('pingDevice', () => {
  test('reports the device and the station it is looking at', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);

    await pingDevice('11111111-1111-4111-8111-111111111111', 'rosario');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/devices\/ping$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      deviceId: '11111111-1111-4111-8111-111111111111',
      stationId: 'rosario',
    });
  });

  test('omits the station when none is open', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);

    await pingDevice('11111111-1111-4111-8111-111111111111');

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      deviceId: '11111111-1111-4111-8111-111111111111',
    });
  });

  test('never throws, because telemetry must not break a screen', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down');
    }));

    await expect(
      pingDevice('11111111-1111-4111-8111-111111111111', 'goya')
    ).resolves.toBeUndefined();
  });
});
