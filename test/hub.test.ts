import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs without types
import {
  hubAnswer, hubDescription, hubFaqHtml, hubFaqJsonLd, hubTable, pickHeadline, HUB_FAQ,
} from '../landing/scripts/hub.mjs';

function reading(overrides: Record<string, unknown> = {}) {
  return {
    slug: 'test', nombre: 'Test', level: null, state: null, deltaCm: null,
    measuredAtIso: null, measuredAtProsa: null, ownStation: true,
    ...overrides,
  };
}

const corrientes = reading({
  slug: 'corrientes', nombre: 'Corrientes', level: 2.4, state: 'normal', deltaCm: -3,
  measuredAtIso: '2026-10-08', measuredAtProsa: '8 de octubre de 2026',
});
const rosario = reading({
  slug: 'rosario', nombre: 'Rosario', level: 3.13, state: 'normal', deltaCm: 5,
  measuredAtIso: '2026-10-08', measuredAtProsa: '8 de octubre de 2026',
});
const noData = reading({ slug: 'goya', nombre: 'Goya' });

describe('pickHeadline', () => {
  it('orders Corrientes, Rosario, then a Delta station', () => {
    const sanFernando = reading({ slug: 'san-fernando', nombre: 'San Fernando', level: 1.1 });
    expect(pickHeadline([sanFernando, rosario, corrientes]).map((r: any) => r.slug))
      .toEqual(['corrientes', 'rosario', 'san-fernando']);
  });

  it('skips a headline station with no level', () => {
    expect(pickHeadline([corrientes, noData]).map((r: any) => r.slug)).toEqual(['corrientes']);
  });

  it('falls back to Zárate when San Fernando has no data', () => {
    const zarate = reading({ slug: 'zarate', nombre: 'Zárate', level: 1.8 });
    expect(pickHeadline([corrientes, rosario, zarate]).map((r: any) => r.slug))
      .toEqual(['corrientes', 'rosario', 'zarate']);
  });

  it('returns nothing when no reference station has data', () => {
    expect(pickHeadline([noData])).toEqual([]);
  });
});

describe('hubAnswer', () => {
  it('leads with the headline numbers and the measurement date', () => {
    const text = hubAnswer([corrientes, rosario]);
    expect(text).toContain('2,40 m en Corrientes');
    expect(text).toContain('3,13 m en Rosario');
    expect(text).toContain('medición de Prefectura del 8 de octubre de 2026');
  });

  // A headline-only reference station carrying no delta of its own, so the
  // coverage/up/down/stable math below is driven entirely by the explicit
  // station sets each test builds — never by what corrientes/rosario happen
  // to carry.
  const headlineOnly = reading({
    slug: 'corrientes', nombre: 'Corrientes', level: 2.4,
    measuredAtIso: '2026-10-08', measuredAtProsa: '8 de octubre de 2026',
  });

  // `n` stations with their own gauge, the first `withDelta` of them carrying
  // a delta from `deltaCm(i)` and the rest null, so tests can dial coverage
  // precisely.
  function stationSet(n, withDelta, deltaCm) {
    return Array.from({ length: n }, (_, i) =>
      reading({
        slug: `st-${i}`, nombre: `St ${i}`, level: 1,
        deltaCm: i < withDelta ? deltaCm(i) : null,
      }));
  }

  it('reports suben/bajan/mantienen once coverage reaches 2/3 of stations', () => {
    // 10 real stations (plus the headline, which carries no delta of its
    // own): 5 up (>=2cm), 0 down, 2 within the ±2cm "se mantiene" band, 2
    // with no reading at all. 7/10 = 70%, over the 2/3 gate.
    const up = stationSet(5, 5, () => 5);
    const stable = stationSet(2, 2, () => 1);
    const noDelta = stationSet(2, 0, () => null);
    const text = hubAnswer([headlineOnly, ...up, ...stable, ...noDelta]);
    expect(text).toContain('de 7 estaciones, 5 suben, 0 bajan y 2 se mantienen');
  });

  it('omits the clause below 2/3 coverage, even with real deltas', () => {
    // 11 real stations (incl. the headline, which has no delta), 6 with a
    // delta (6/11 ≈ 55%, under the 2/3 gate).
    const some = stationSet(6, 6, () => 5);
    const noDelta = stationSet(4, 0, () => null);
    const text = hubAnswer([headlineOnly, ...some, ...noDelta]);
    expect(text).not.toMatch(/suben|bajan|mantien/);
  });

  it('never double-counts a borrowed reading as its own station', () => {
    // 3 real stations with a delta (100% coverage) plus a borrowed reading
    // that must not inflate the denominator or get counted twice.
    const borrowed = reading({
      slug: 'san-javier', nombre: 'San Javier', level: 2.4, deltaCm: -5, ownStation: false,
    });
    const real = stationSet(3, 3, () => 5);
    const text = hubAnswer([headlineOnly, ...real, borrowed]);
    expect(text).toContain('de 3 estaciones, 3 suben, 0 bajan y 0 se mantienen');
  });

  it('uses the singular "1 estación sube" form, not "1 suben"', () => {
    const up = stationSet(1, 1, () => 5);
    const stable = stationSet(2, 2, () => 1);
    const text = hubAnswer([headlineOnly, ...up, ...stable]);
    expect(text).toContain('de 3 estaciones, 1 estación sube, 0 bajan y 2 se mantienen');
  });

  it('uses the singular form for a lone falling or lone stable station too', () => {
    const down = stationSet(1, 1, () => -5);
    const stable = stationSet(1, 1, () => 0);
    const up = stationSet(2, 2, () => 5);
    const text = hubAnswer([headlineOnly, ...down, ...stable, ...up]);
    expect(text).toContain('de 4 estaciones, 2 suben, 1 estación baja y 1 estación se mantiene');
  });

  it('treats a delta under 2cm either way as "se mantiene", not a move', () => {
    const stable = stationSet(3, 3, (i) => [1, 0, -1][i]);
    const text = hubAnswer([headlineOnly, ...stable]);
    expect(text).toContain('de 3 estaciones, 0 suben, 0 bajan y 3 se mantienen');
  });

  it('omits the clause when no station has a delta', () => {
    expect(hubAnswer([headlineOnly])).not.toMatch(/suben|bajan|mantien/);
  });

  it('omits the whole sentence when no reference station has a reading', () => {
    expect(hubAnswer([noData])).toBeNull();
  });

  it('never invents a date when none is known', () => {
    const undated = reading({ slug: 'corrientes', nombre: 'Corrientes', level: 2.4 });
    const text = hubAnswer([undated]);
    expect(text).not.toMatch(/medición/);
    expect(text).toContain('2,40 m en Corrientes');
  });
});

describe('hubDescription', () => {
  it('includes the headline numbers and the date', () => {
    const d = hubDescription({ count: 38, readings: [corrientes, rosario], dateProsa: '8 de octubre de 2026' });
    expect(d).toContain('Rosario');
    expect(d).toContain('8 de octubre de 2026');
    expect(d.length).toBeLessThanOrEqual(160);
  });

  it('adds the station count only when it still fits under 160 characters', () => {
    const short = hubDescription({ count: 38, readings: [corrientes], dateProsa: '8 de octubre de 2026' });
    expect(short).toContain('38 estaciones');
  });

  it('falls back to the station-count sentence with no readings', () => {
    const d = hubDescription({ count: 38, readings: [noData], dateProsa: null });
    expect(d).toContain('38 estaciones');
    expect(d).not.toContain('Rosario');
  });
});

describe('hubTable', () => {
  it('renders one row per reading, as a semantic table', () => {
    const html = hubTable([corrientes, rosario]);
    expect(html).toContain('<table class="hub-table">');
    expect(html).toContain('<caption>');
    expect(html).toContain('scope="col"');
    expect(html.match(/<tr>/g)?.length).toBe(3); // thead + 2 rows
  });

  it('links each locality to its own page', () => {
    expect(hubTable([corrientes])).toContain('href="/rio/corrientes/"');
  });

  it('shows the arrow and cm for a station with a delta', () => {
    expect(hubTable([rosario])).toContain('▲ 5 cm');
    expect(hubTable([corrientes])).toContain('▼ 3 cm');
  });

  it('shows a dash rather than invent a value for missing data', () => {
    const html = hubTable([noData]);
    expect(html).toMatch(/<td>—<\/td>/);
  });

  it('wraps the table so a narrow viewport scrolls the table, not the page', () => {
    expect(hubTable([corrientes])).toContain('<div class="table-wrap">');
  });
});

describe('FAQ', () => {
  it('keeps the JSON-LD answer text identical to the visible text', () => {
    const html = hubFaqHtml();
    const jsonld = hubFaqJsonLd();

    for (const { q, a } of HUB_FAQ) {
      expect(html).toContain(q);
      expect(html).toContain(a);
      const entry = jsonld.mainEntity.find((e: any) => e.name === q);
      expect(entry?.acceptedAnswer?.text).toBe(a);
    }
  });

  it('renders three visible FAQ entries', () => {
    const blocks = hubFaqHtml().match(/<details class="faq-item">/g) ?? [];
    expect(blocks.length).toBe(3);
  });
});
