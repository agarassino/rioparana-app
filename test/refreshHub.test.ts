import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs without types
import {
  toPoints, readBakedLevel, readBakedDate, fallbackReading, buildOverrides, hubDailyDelta,
} from '../scripts/refresh-river-landing.mjs';
// @ts-expect-error plain .mjs without types
import { indexPage } from '../landing/scripts/build-directory.mjs';

const HOUR = 3_600_000;
// `latest` long in the past relative to the real clock — any test that
// passes only because hubDailyDelta secretly reads Date.now() would fail
// here, since there is nothing near "now" in these points at all.
const LATEST_AT = new Date('2020-01-10T00:00:00Z').getTime();
const point = (hoursBeforeLatest: number, level: number) => ({
  timestamp: new Date(LATEST_AT - hoursBeforeLatest * HOUR).toISOString(),
  level,
});

describe('hubDailyDelta', () => {
  it('computes the delta regardless of how far "now" is from the readings', () => {
    const points = [point(24, 2.0), point(0, 2.5)];
    expect(hubDailyDelta(points)).toBe(50);
  });

  it('picks the point closest to 24h before the latest reading, not before now', () => {
    const points = [point(48, 1.0), point(22, 2.2), point(0, 2.5)];
    // 22h is closer to the 24h target than 48h.
    expect(hubDailyDelta(points)).toBe(Math.round((2.5 - 2.2) * 100));
  });

  it('accepts a reference point at the edge of the window (18h and 30h)', () => {
    expect(hubDailyDelta([point(18, 2.0), point(0, 2.5)])).toBe(50);
    expect(hubDailyDelta([point(30, 2.0), point(0, 2.5)])).toBe(50);
  });

  it('returns null when the only candidate sits outside the 18-30h window', () => {
    expect(hubDailyDelta([point(17, 2.0), point(0, 2.5)])).toBeNull();
    expect(hubDailyDelta([point(31, 2.0), point(0, 2.5)])).toBeNull();
  });

  it('returns null with fewer than two points', () => {
    expect(hubDailyDelta([point(0, 2.5)])).toBeNull();
    expect(hubDailyDelta([])).toBeNull();
  });

  it('rounds to the nearest centimetre', () => {
    expect(hubDailyDelta([point(24, 2.0), point(0, 2.006)])).toBe(1);
  });
});

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
