import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURE = readFileSync(join(process.cwd(), 'test/fixtures/pna-index.html'), 'utf-8');

const PNA = 'contenidosweb.prefecturanaval.gob.ar';

// The module caches the scraped index, so each test needs a fresh copy.
async function loadRiverApi() {
  vi.resetModules();
  return import('../src/services/api/riverApi');
}

function stubNetwork(options: { indexOk?: boolean; backendLevel?: unknown } = {}) {
  const { indexOk = true, backendLevel = null } = options;
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (String(url).includes(PNA)) {
      return { ok: indexOk, text: async () => (indexOk ? FIXTURE : '') };
    }
    return { ok: backendLevel !== null, json: async () => backendLevel };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('getCurrentWaterLevel', () => {
  test('returns the level scraped from the index', async () => {
    stubNetwork();
    const { getCurrentWaterLevel } = await loadRiverApi();

    const level = await getCurrentWaterLevel('rosario');

    expect(level?.level).toBe(3);
    expect(level?.trend).toBe('stable');
  });

  test('scrapes the index once even when several stations are requested', async () => {
    const fetchMock = stubNetwork();
    const { getCurrentWaterLevel } = await loadRiverApi();

    await getCurrentWaterLevel('rosario');
    await getCurrentWaterLevel('parana');
    await getCurrentWaterLevel('corrientes');

    const indexCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes(PNA));
    expect(indexCalls).toHaveLength(1);
  });

  test('pushes the whole batch to the shared cache', async () => {
    const fetchMock = stubNetwork();
    const { getCurrentWaterLevel } = await loadRiverApi();

    await getCurrentWaterLevel('rosario');

    const push = fetchMock.mock.calls.find(
      ([url, init]) => String(url).endsWith('/river') && (init as RequestInit)?.method === 'POST'
    );
    expect(push).toBeDefined();
    const body = JSON.parse((push?.[1] as RequestInit).body as string);
    expect(body.readings).toHaveLength(5);
  });

  test('falls back to the shared cache when the index cannot be scraped', async () => {
    stubNetwork({
      indexOk: false,
      backendLevel: {
        stationId: 'rosario',
        level: 2.9,
        trend: 'falling',
        changeRate: -3,
        timestamp: '2026-08-14T15:00:00.000Z',
      },
    });
    const { getCurrentWaterLevel } = await loadRiverApi();

    const level = await getCurrentWaterLevel('rosario');

    expect(level?.level).toBe(2.9);
  });

  test('falls back to the shared cache for a station the index does not publish', async () => {
    stubNetwork({
      backendLevel: {
        stationId: 'goya',
        level: 3.37,
        trend: 'falling',
        changeRate: -2,
        timestamp: '2026-08-14T15:00:00.000Z',
      },
    });
    const { getCurrentWaterLevel } = await loadRiverApi();

    const level = await getCurrentWaterLevel('goya');

    expect(level?.level).toBe(3.37);
  });

  test('returns null for a station the app does not list', async () => {
    stubNetwork();
    const { getCurrentWaterLevel } = await loadRiverApi();

    expect(await getCurrentWaterLevel('nope')).toBeNull();
  });
});
