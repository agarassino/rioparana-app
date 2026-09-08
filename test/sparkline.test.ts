import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  chartSvg, dayBadge, dayChange, lastDays, rangeLabel, scaleLabel, sparkline, trendSummary,
} from '../landing/scripts/sparkline.mjs';

const NOW = new Date('2026-09-07T12:00:00Z');

// Helper: a reading N days before NOW.
const daysAgo = (n: number, level: number) => ({
  timestamp: new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString(),
  level,
});

describe('lastDays', () => {
  test('keeps readings inside the window', () => {
    const points = [daysAgo(6, 3), daysAgo(1, 3.2)];

    expect(lastDays(points, 7, NOW)).toHaveLength(2);
  });

  test('drops readings older than the window', () => {
    const points = [daysAgo(30, 2.1), daysAgo(8, 2.5), daysAgo(2, 3)];

    expect(lastDays(points, 7, NOW).map((p) => p.level)).toEqual([3]);
  });

  test('sorts oldest first so the line reads left to right', () => {
    const points = [daysAgo(1, 3.2), daysAgo(5, 2.8), daysAgo(3, 3)];

    expect(lastDays(points, 7, NOW).map((p) => p.level)).toEqual([2.8, 3, 3.2]);
  });

  test('discards readings the API could not have meant', () => {
    // A null level or an unparseable date would poison the scale and push the
    // rest of the curve into a flat line at the edge of the box.
    const points = [
      daysAgo(2, 3),
      { timestamp: daysAgo(1, 0).timestamp, level: null },
      { timestamp: 'no es una fecha', level: 3.1 },
      daysAgo(1, 3.2),
    ];

    expect(lastDays(points as never, 7, NOW).map((p) => p.level)).toEqual([3, 3.2]);
  });
});

describe('sparkline', () => {
  const box = { width: 300, height: 80, padding: 4 };

  test('returns null when a line cannot be drawn', () => {
    expect(sparkline([], box)).toBeNull();
    expect(sparkline([daysAgo(1, 3)], box)).toBeNull();
  });

  test('puts the highest reading at the top and the lowest at the bottom', () => {
    const line = sparkline([daysAgo(2, 2.8), daysAgo(1, 3.4)], box)!;
    const [first, second] = line.path.split(' ').map((pair) => pair.split(',').map(Number));

    // SVG y grows downwards, so the taller reading gets the smaller y.
    expect(first[1]).toBe(box.height - box.padding);
    expect(second[1]).toBe(box.padding);
  });

  test('scales to the range of the data, not to zero', () => {
    // River levels sit far from zero. A zero-based axis would squash a 60 cm
    // swing into a line that looks perfectly flat, which is the whole point of
    // the chart lost.
    const line = sparkline([daysAgo(2, 2.8), daysAgo(1, 3.4)], box)!;
    const ys = line.path.split(' ').map((pair) => Number(pair.split(',')[1]));

    expect(Math.max(...ys) - Math.min(...ys)).toBe(box.height - 2 * box.padding);
  });

  test('places a flat series along the middle instead of dividing by zero', () => {
    const line = sparkline([daysAgo(2, 3), daysAgo(1, 3)], box)!;
    const ys = line.path.split(' ').map((pair) => Number(pair.split(',')[1]));

    expect(ys).toEqual([box.height / 2, box.height / 2]);
  });

  test('spaces readings by time, so a gap in the data shows as a gap', () => {
    // Six days of silence then two readings an hour apart must not come out
    // evenly spaced, or the chart invents a history it never had.
    const points = [daysAgo(7, 3), daysAgo(1, 3.2), daysAgo(1 - 1 / 24, 3.4)];
    const xs = sparkline(points, box)!.path.split(' ').map((pair) => Number(pair.split(',')[0]));

    expect(xs[1] - xs[0]).toBeGreaterThan(xs[2] - xs[1]);
  });

  test('reports the extremes so the page can label the scale', () => {
    const line = sparkline([daysAgo(2, 2.8), daysAgo(1, 3.4), daysAgo(3, 3)], box)!;

    expect(line.min).toBe(2.8);
    expect(line.max).toBe(3.4);
    expect(line.last).toBe(3.4);
  });

  test('draws the alert line when it falls inside the range', () => {
    const line = sparkline([daysAgo(2, 4.9), daysAgo(1, 5.1)], { ...box, alertLevel: 5 })!;

    expect(line.alertY).toBeCloseTo(box.height / 2, 5);
  });

  test('omits the alert line when it sits far above the readings', () => {
    // Rosario alerts at 5 m and normally runs near 3 m. Forcing that onto the
    // axis would flatten the curve against the floor of the box.
    const line = sparkline([daysAgo(2, 2.8), daysAgo(1, 3.4)], { ...box, alertLevel: 5 })!;

    expect(line.alertY).toBeNull();
  });
});

describe('trendSummary', () => {
  const box = { width: 300, height: 80, padding: 4 };
  const line = (a: number, b: number, daysApart: number) =>
    sparkline([daysAgo(daysApart, a), daysAgo(0, b)], box)!;

  test('says how much the river rose and over how long', () => {
    expect(trendSummary(line(3, 3.12, 3))).toBe('Subió 12 cm en 3 días');
  });

  test('says how much it fell', () => {
    expect(trendSummary(line(3.4, 3.15, 5))).toBe('Bajó 25 cm en 5 días');
  });

  test('reports the span it actually has, not the window it asked for', () => {
    // Two days of readings must not be described as a week. The chart is
    // titled "7 días"; the sentence has to stay honest about the real span.
    expect(trendSummary(line(3, 3.1, 2))).toBe('Subió 10 cm en 2 días');
  });

  test('drops to hours when that is all the history there is', () => {
    expect(trendSummary(line(3, 3.05, 5 / 24))).toBe('Subió 5 cm en las últimas horas');
  });

  test('calls a centimetre of drift what it is', () => {
    expect(trendSummary(line(3, 3.004, 4))).toBe('Estable en los últimos 4 días');
  });

  test('agrees with itself in the singular', () => {
    // With one day of history this read "Estable en los últimos 1 día", which
    // only shows up once there is real data to draw.
    expect(trendSummary(line(3, 3.002, 1))).toBe('Estable en el último día');
  });

  test('says nothing when there is no line', () => {
    expect(trendSummary(null)).toBe('');
  });
});

describe('inlining into the page', () => {
  test('still works after the build strips the export keywords', () => {
    // build-directory.mjs ships this exact file to the browser inside a
    // <script> by removing `export `. If that ever stops producing runnable
    // code, it has to fail here and not silently on 39 published pages.
    const src = readFileSync(
      join(process.cwd(), 'landing/scripts/sparkline.mjs'), 'utf8'
    ).replace(/^export /gm, '');

    expect(src).not.toMatch(/\bexport\b/);

    const inlined = new Function(
      `${src}; return { CHART_DAYS: CHART_DAYS, lastDays: lastDays, sparkline: sparkline, trendSummary: trendSummary };`
    )();

    expect(inlined.CHART_DAYS).toBe(7);
    const line = inlined.sparkline(
      inlined.lastDays([daysAgo(3, 3), daysAgo(1, 3.2)], 7, NOW),
      { width: 300, height: 80, padding: 4 }
    );
    expect(inlined.trendSummary(line)).toBe('Subió 20 cm en 2 días');
  });
});

describe('chartSvg', () => {
  const box = { width: 300, height: 80, padding: 4 };
  const rising = () => sparkline([daysAgo(3, 3), daysAgo(1, 3.2)], box)!;

  test('returns an empty string when there is no line to draw', () => {
    expect(chartSvg(null)).toBe('');
  });

  test('draws the curve and closes the fill on the baseline', () => {
    const svg = chartSvg(rising());

    expect(svg).toContain(`viewBox="0 0 ${box.width} ${box.height}"`);
    expect(svg).toContain(`points="${rising().path}"`);
    // The area has to reach the floor of the box or the fill hangs in mid-air.
    expect(svg).toMatch(new RegExp(`L[\\d.]+,${box.height} Z`));
  });

  test('keeps the stroke weight when the box is stretched to the column', () => {
    // preserveAspectRatio="none" is what lets the chart fill any width; without
    // the opt-out the stroke stretches with it and reads as a smear.
    const svg = chartSvg(rising());

    expect(svg).toContain('preserveAspectRatio="none"');
    expect(svg).toContain('vector-effect="non-scaling-stroke"');
  });

  test('describes itself for a reader who cannot see it', () => {
    expect(chartSvg(rising())).toContain('aria-label="Subió 20 cm en 2 días"');
  });

  test('escapes the label instead of letting it break out of the attribute', () => {
    const line = { ...rising(), last: NaN };
    // A malformed line must not produce an attribute that ends early.
    expect(chartSvg(line)).not.toMatch(/aria-label="[^"]*"[^>]*"/);
  });

  test('omits the alert rule unless the level shares the axis', () => {
    expect(chartSvg(rising())).not.toContain('trend-alert');

    const near = sparkline([daysAgo(2, 4.9), daysAgo(1, 5.1)], { ...box, alertLevel: 5 })!;
    expect(chartSvg(near)).toContain('trend-alert');
  });
});

describe('chart captions', () => {
  const box = { width: 300, height: 80, padding: 4 };
  const line = sparkline([daysAgo(3, 2.8), daysAgo(1, 3.4)], box)!;
  const day = (iso: string) => iso.slice(0, 10);

  test('labels the scale with both extremes at centimetre precision', () => {
    expect(scaleLabel(line)).toBe('Mínima 2.80 m · máxima 3.40 m');
  });

  test('credits the source and counts the readings', () => {
    expect(rangeLabel(line, day)).toBe(
      '2026-09-04 — 2026-09-06 · 2 mediciones de Prefectura Naval Argentina'
    );
  });

  test('does not say "2 medición"', () => {
    const one = { ...line, count: 1 };
    expect(rangeLabel(one, day)).toContain('1 medición de');
  });

  test('say nothing without a line', () => {
    expect(scaleLabel(null)).toBe('');
    expect(rangeLabel(null, day)).toBe('');
  });
});

describe('dayChange', () => {
  test('measures what the river did since yesterday', () => {
    const points = lastDays([daysAgo(1, 3), daysAgo(0, 3.08)], 7, NOW);

    expect(dayChange(points, NOW)!.cm).toBe(8);
  });

  test('goes negative when the river dropped', () => {
    const points = lastDays([daysAgo(1, 3.3), daysAgo(0, 3.18)], 7, NOW);

    expect(dayChange(points, NOW)!.cm).toBe(-12);
  });

  test('reports the span it really compared', () => {
    // Prefectura publishes twice a day, so the reading nearest to 24 h back is
    // rarely exactly 24 h back. The badge must not round that away silently.
    const points = lastDays([daysAgo(20 / 24, 3), daysAgo(0, 3.05)], 7, NOW);

    expect(dayChange(points, NOW)!.hours).toBe(20);
  });

  test('says nothing when the history does not reach back a day', () => {
    // Six hours of readings cannot answer a question about yesterday.
    const points = lastDays([daysAgo(6 / 24, 3), daysAgo(0, 3.05)], 7, NOW);

    expect(dayChange(points, NOW)).toBeNull();
  });

  test('says nothing when the newest reading is itself stale', () => {
    // A pusher that stopped three days ago must not have its last two readings
    // presented as "the last 24 hours".
    const points = lastDays([daysAgo(4, 3), daysAgo(3, 3.2)], 7, NOW);

    expect(dayChange(points, NOW)).toBeNull();
  });

  test('ignores a reference so old it answers a different question', () => {
    const points = lastDays([daysAgo(3, 2.5), daysAgo(0, 3.05)], 7, NOW);

    expect(dayChange(points, NOW)).toBeNull();
  });

  test('says nothing without enough readings', () => {
    expect(dayChange([], NOW)).toBeNull();
    expect(dayChange(lastDays([daysAgo(0, 3)], 7, NOW), NOW)).toBeNull();
  });
});

describe('dayBadge', () => {
  const at = (cm: number, hours = 24) => dayBadge({ cm, hours })!;

  test('points up and names the rise', () => {
    expect(at(8)).toEqual({ dir: 'up', text: 'Subió 8 cm', detail: 'en las últimas 24 h' });
  });

  test('points down and names the fall', () => {
    expect(at(-12).dir).toBe('down');
    expect(at(-12).text).toBe('Bajó 12 cm');
  });

  test('states the real span when it is not a round day', () => {
    expect(at(5, 20).detail).toBe('en las últimas 20 h');
  });

  test('calls a still river still', () => {
    expect(at(0)).toEqual({ dir: 'flat', text: 'Sin cambios', detail: 'en las últimas 24 h' });
  });

  test('says nothing without a measurement', () => {
    expect(dayBadge(null)).toBeNull();
  });
});
