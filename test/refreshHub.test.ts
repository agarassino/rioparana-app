import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs without types
import {
  toPoints, readBakedLevel, readBakedDate, fallbackReading, buildOverrides,
} from '../scripts/refresh-river-landing.mjs';
// @ts-expect-error plain .mjs without types
import { indexPage } from '../landing/scripts/build-directory.mjs';

describe('toPoints', () => {
  it('maps INA rows into sparkline points, oldest first', () => {
    const rows = [
      { valor: '2.50', timestart: '2026-10-08T12:00:00Z' },
      { valor: '2.40', timestart: '2026-10-07T12:00:00Z' },
    ];
    expect(toPoints(rows)).toEqual([
      { level: 2.4, timestamp: '2026-10-07T12:00:00Z' },
      { level: 2.5, timestamp: '2026-10-08T12:00:00Z' },
    ]);
  });

  it('drops rows with no usable value or timestamp', () => {
    const rows = [
      { valor: 'nan', timestart: '2026-10-08T12:00:00Z' },
      { valor: '2.5', timestart: 'not-a-date' },
      { valor: '2.4', timestart: '2026-10-07T12:00:00Z' },
    ];
    expect(toPoints(rows)).toHaveLength(1);
  });
});

const PAGE = `<!doctype html><html><body>
<span id="river-now" class="st-level" data-state="normal">2.40<span class="unit"> m</span></span>
<p id="river-src" class="stations-note">Medición de la Prefectura Naval Argentina en Corrientes, del <time datetime="2026-10-07">7 de octubre de 2026</time>.</p>
</body></html>`;

describe('readBakedLevel', () => {
  it('reads the level and state already baked into the page', () => {
    expect(readBakedLevel(PAGE)).toEqual({ level: 2.4, state: 'normal' });
  });

  it('returns null when the markup does not match', () => {
    expect(readBakedLevel('<html></html>')).toBeNull();
  });
});

describe('readBakedDate', () => {
  it('reads the measurement date already baked into the page', () => {
    expect(readBakedDate(PAGE)).toEqual({ iso: '2026-10-07', prosa: '7 de octubre de 2026' });
  });

  it('returns null when the markup does not match', () => {
    expect(readBakedDate('<html></html>')).toBeNull();
  });
});

describe('fallbackReading', () => {
  it('builds a reading from whatever the page already had, with no delta', () => {
    expect(fallbackReading(PAGE)).toEqual({
      level: 2.4, state: 'normal', deltaCm: null,
      measuredAtIso: '2026-10-07', measuredAtProsa: '7 de octubre de 2026',
    });
  });

  it('returns null when the page has nothing baked in', () => {
    expect(fallbackReading('<html></html>')).toBeNull();
  });

  it('returns null when there is no page to fall back to', () => {
    expect(fallbackReading(null)).toBeNull();
  });
});

describe('buildOverrides', () => {
  it('keeps only the results that produced a reading, keyed by slug', () => {
    const results = [
      { slug: 'corrientes', status: 'updated', reading: { level: 2.4 } },
      { slug: 'goya', status: 'failed', reading: null },
    ];
    const overrides = buildOverrides(results);
    expect(overrides.get('corrientes')).toEqual({ level: 2.4 });
    expect(overrides.has('goya')).toBe(false);
  });

  it('feeds indexPage() the same readings a refresh run just produced', () => {
    // The actual glue a daily refresh runs through: refreshOne()'s results ->
    // buildOverrides() -> indexPage(). Breaking any link in that chain (e.g.
    // skipping the hub regen, or building overrides from the wrong field)
    // would make this stop seeing fresh numbers on the hub.
    const results = [
      {
        slug: 'corrientes', status: 'updated',
        reading: {
          level: 2.4, state: 'normal', deltaCm: -3,
          measuredAtIso: '2026-10-08', measuredAtProsa: '8 de octubre de 2026',
        },
      },
    ];
    const html = indexPage(buildOverrides(results));
    expect(html).toContain('2,40 m en Corrientes');
    expect(html).toContain('▼ 3 cm');
  });
});
