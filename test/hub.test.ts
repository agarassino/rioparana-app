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

  it('adds the suben/bajan clause only from readings with a delta', () => {
    const text = hubAnswer([corrientes, rosario]);
    // corrientes falls (-3), rosario rises (+5)
    expect(text).toContain('1 estaciones suben y 1 bajan');
  });

  it('never double-counts a borrowed reading as its own station', () => {
    const borrowed = reading({
      slug: 'san-javier', nombre: 'San Javier', level: 2.4, deltaCm: -3, ownStation: false,
    });
    const text = hubAnswer([corrientes, rosario, borrowed]);
    expect(text).toContain('1 estaciones suben y 1 bajan');
  });

  it('omits the suben/bajan clause when no station has a delta', () => {
    const noDelta = reading({
      slug: 'corrientes', nombre: 'Corrientes', level: 2.4,
      measuredAtIso: '2026-10-08', measuredAtProsa: '8 de octubre de 2026',
    });
    expect(hubAnswer([noDelta])).not.toMatch(/suben|bajan/);
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
