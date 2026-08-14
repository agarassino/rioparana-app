import { afterEach, describe, expect, test, vi } from 'vitest';
import { getBackendNews, getBackendWeather } from '../src/services/api/backend';

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
