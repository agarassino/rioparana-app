import { afterEach, describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchAllLevels, parseRiverIndex } from '../src/services/api/riverIndex';

const FIXTURE = readFileSync(join(process.cwd(), 'test/fixtures/pna-index.html'), 'utf-8');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseRiverIndex', () => {
  test('maps configured station codes to their station ids', () => {
    const ids = parseRiverIndex(FIXTURE).map((l) => l.stationId).sort();

    expect(ids).toEqual(['barranqueras', 'corrientes', 'parana', 'rosario', 'tigre']);
  });

  test('drops ports the app does not list', () => {
    // GUAYRA (BRASIL) is published but sits outside Argentina, so it is not listed.
    expect(parseRiverIndex(FIXTURE)).toHaveLength(5);
  });

  test('returns the level as a number and the timestamp as a Date', () => {
    const rosario = parseRiverIndex(FIXTURE).find((l) => l.stationId === 'rosario');

    expect(rosario?.level).toBe(3);
    expect(rosario?.timestamp).toBeInstanceOf(Date);
    expect(rosario?.timestamp.toISOString()).toBe('2026-08-14T15:00:00.000Z');
  });

  test('maps the published state to a trend', () => {
    const corrientes = parseRiverIndex(FIXTURE).find((l) => l.stationId === 'corrientes');

    expect(corrientes?.trend).toBe('falling');
    expect(corrientes?.changeRate).toBeCloseTo(-4, 5);
  });

  test('returns an empty list for markup without rows', () => {
    expect(parseRiverIndex('<html></html>')).toEqual([]);
  });
});

describe('fetchAllLevels', () => {
  test('requests the index once and returns every configured station', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => FIXTURE }));
    vi.stubGlobal('fetch', fetchMock);

    const levels = await fetchAllLevels();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(levels).toHaveLength(5);
  });

  test('returns an empty list when the index responds with an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, text: async () => '' })));

    expect(await fetchAllLevels()).toEqual([]);
  });

  test('returns an empty list when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('unreachable');
    }));

    expect(await fetchAllLevels()).toEqual([]);
  });
});

describe('reference levels', () => {
  test('reads the alert and evacuation levels published per station', () => {
    const rosario = parseRiverIndex(FIXTURE).find((l) => l.stationId === 'rosario');

    expect(rosario?.alertLevel).toBe(5);
    expect(rosario?.evacuationLevel).toBe(5.3);
  });

  test('leaves them undefined when the station does not publish them', () => {
    const stripped = FIXTURE.replace(/data-label="Alerta:">[^<]*/g, 'data-label="Alerta:">-');
    const rosario = parseRiverIndex(stripped).find((l) => l.stationId === 'rosario');

    expect(rosario?.alertLevel).toBeUndefined();
  });
});
