import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fetchRiverIndex, parseRiverIndex } from '../../src/scrapers/riverIndex.js';

const FIXTURE = readFileSync(
  fileURLToPath(new URL('../fixtures/pna-index.html', import.meta.url)),
  'utf-8'
);

describe('parseRiverIndex', () => {
  it('returns one reading per station row', () => {
    expect(parseRiverIndex(FIXTURE)).toHaveLength(6);
  });

  it('reads the station code out of the chart link', () => {
    const codes = parseRiverIndex(FIXTURE).map((r) => r.code);
    expect(codes).toEqual(['21', '130', '140', '230', '280', '430']);
  });

  it('reads name, river and level', () => {
    const rosario = parseRiverIndex(FIXTURE).find((r) => r.code === '280');
    expect(rosario?.name).toBe('ROSARIO');
    expect(rosario?.river).toBe('PARANA');
    expect(rosario?.level).toBe(3);
  });

  it('parses the published timestamp into an ISO string in Argentine time', () => {
    const rosario = parseRiverIndex(FIXTURE).find((r) => r.code === '280');
    // 14/AUG/26 - 1200 local (-03:00)
    expect(rosario?.timestamp).toBe('2026-08-14T15:00:00.000Z');
  });

  it('maps the published state to a trend', () => {
    const byCode = new Map(parseRiverIndex(FIXTURE).map((r) => [r.code, r]));
    expect(byCode.get('280')?.trend).toBe('stable'); // ESTAC.
    expect(byCode.get('130')?.trend).toBe('falling'); // BAJA
    expect(byCode.get('21')?.trend).toBe('rising'); // CRECE
  });

  it('converts the published variation into centimetres', () => {
    const guayra = parseRiverIndex(FIXTURE).find((r) => r.code === '21');
    expect(guayra?.changeRate).toBeCloseTo(136, 5); // published as 1.36 m
  });

  it('keeps the sign of a falling variation', () => {
    const corrientes = parseRiverIndex(FIXTURE).find((r) => r.code === '130');
    expect(corrientes?.changeRate).toBeCloseTo(-4, 5); // published as -0.04 m
  });

  it('keeps rivers other than the Paraná so callers can filter', () => {
    const rivers = new Set(parseRiverIndex(FIXTURE).map((r) => r.river));
    expect(rivers.has('DELTA PARANA')).toBe(true);
  });

  it('returns an empty list for markup without rows', () => {
    expect(parseRiverIndex('<html><body>nada</body></html>')).toEqual([]);
  });
});

describe('fetchRiverIndex', () => {
  it('requests the index once and returns every reading', async () => {
    const fetchFn = vi.fn(async () => new Response(FIXTURE, { status: 200 }));

    const readings = await fetchRiverIndex(fetchFn as unknown as typeof fetch);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(readings).toHaveLength(6);
  });

  it('throws when the index responds with an error status', async () => {
    const fetchFn = vi.fn(async () => new Response('nope', { status: 503 }));

    await expect(fetchRiverIndex(fetchFn as unknown as typeof fetch)).rejects.toThrow('HTTP 503');
  });
});
