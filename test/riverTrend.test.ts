import { describe, expect, test } from 'vitest';
import {
  CHART_DAYS, dayChange, lastDays, sparkPath, trendSummary,
} from '../src/services/riverTrend';

const NOW = new Date('2026-09-08T12:00:00Z');
const daysAgo = (n: number, level: number) => ({
  timestamp: new Date(NOW.getTime() - n * 86400_000).toISOString(),
  level,
});
const hoursAgo = (h: number, level: number) => ({
  timestamp: new Date(NOW.getTime() - h * 3600_000).toISOString(),
  level,
});

describe('lastDays', () => {
  test('keeps the window and orders it oldest first', () => {
    const pts = lastDays([daysAgo(1, 3.2), daysAgo(9, 2), daysAgo(5, 2.8)], CHART_DAYS, NOW);

    expect(pts.map((p) => p.level)).toEqual([2.8, 3.2]);
  });

  test('drops readings the API could not have meant', () => {
    // Number(null) is 0, which is a plausible-looking river height. Letting it
    // through would drag the whole scale down.
    const pts = lastDays(
      [daysAgo(2, 3), { timestamp: daysAgo(1, 0).timestamp, level: null }, daysAgo(1, 3.2)],
      CHART_DAYS,
      NOW,
    );

    expect(pts.map((p) => p.level)).toEqual([3, 3.2]);
  });
});

describe('sparkPath', () => {
  const box = { width: 300, height: 80, padding: 4 };

  test('needs two readings before it will draw a line', () => {
    expect(sparkPath([], box)).toBeNull();
    expect(sparkPath(lastDays([daysAgo(1, 3)], CHART_DAYS, NOW), box)).toBeNull();
  });

  test('puts the highest reading at the top and the lowest at the bottom', () => {
    const line = sparkPath(lastDays([daysAgo(2, 2.8), daysAgo(1, 3.4)], CHART_DAYS, NOW), box)!;

    expect(line.points[0].y).toBe(box.height - box.padding);
    expect(line.points[1].y).toBe(box.padding);
  });

  test('scales to the range of the data, not to zero', () => {
    // River levels sit far from zero. A zero-based axis squashes a 60 cm swing
    // into a line that looks perfectly flat.
    const line = sparkPath(lastDays([daysAgo(2, 2.8), daysAgo(1, 3.4)], CHART_DAYS, NOW), box)!;
    const ys = line.points.map((p) => p.y);

    expect(Math.max(...ys) - Math.min(...ys)).toBe(box.height - 2 * box.padding);
  });

  test('draws a flat week along the middle instead of dividing by zero', () => {
    const line = sparkPath(lastDays([daysAgo(2, 3), daysAgo(1, 3)], CHART_DAYS, NOW), box)!;

    expect(line.points.map((p) => p.y)).toEqual([box.height / 2, box.height / 2]);
  });

  test('spaces readings by time, so a gap in the data shows as a gap', () => {
    const pts = lastDays([daysAgo(7, 3), daysAgo(1, 3.2), hoursAgo(23, 3.4)], CHART_DAYS, NOW);
    const xs = sparkPath(pts, box)!.points.map((p) => p.x);

    expect(xs[1] - xs[0]).toBeGreaterThan(xs[2] - xs[1]);
  });

  test('reports the extremes so the screen can label the scale', () => {
    const line = sparkPath(lastDays([daysAgo(3, 2.8), daysAgo(1, 3.4)], CHART_DAYS, NOW), box)!;

    expect(line.min).toBe(2.8);
    expect(line.max).toBe(3.4);
  });
});

describe('trendSummary', () => {
  const box = { width: 300, height: 80, padding: 4 };
  const over = (a: number, b: number, days: number) =>
    trendSummary(sparkPath(lastDays([daysAgo(days, a), daysAgo(0, b)], CHART_DAYS, NOW), box));

  test('says how much the river moved and over how long', () => {
    expect(over(3, 3.12, 3)).toBe('Subió 12 cm en 3 días');
    expect(over(3.4, 3.15, 5)).toBe('Bajó 25 cm en 5 días');
  });

  test('reports the span it has, not the window it asked for', () => {
    expect(over(3, 3.1, 2)).toBe('Subió 10 cm en 2 días');
  });

  test('calls a centimetre of drift what it is', () => {
    expect(over(3, 3.004, 4)).toBe('Estable en los últimos 4 días');
  });

  test('agrees with itself in the singular', () => {
    expect(over(3, 3.002, 1)).toBe('Estable en el último día');
  });

  test('says nothing without a line', () => {
    expect(trendSummary(null)).toBe('');
  });
});

describe('dayChange', () => {
  test('measures what the river did since yesterday', () => {
    const pts = lastDays([hoursAgo(24, 3), hoursAgo(1, 3.08)], CHART_DAYS, NOW);

    expect(dayChange(pts, NOW)).toEqual({ cm: 8, hours: 23 });
  });

  test('goes negative when the river dropped', () => {
    const pts = lastDays([hoursAgo(26, 3.3), hoursAgo(2, 3.18)], CHART_DAYS, NOW);

    expect(dayChange(pts, NOW)!.cm).toBe(-12);
  });

  test('says nothing when the history does not reach back a day', () => {
    const pts = lastDays([hoursAgo(6, 3), hoursAgo(1, 3.05)], CHART_DAYS, NOW);

    expect(dayChange(pts, NOW)).toBeNull();
  });

  test('says nothing when the newest reading is itself stale', () => {
    // A pusher that stopped three days ago must not have its last two readings
    // presented as "the last 24 hours".
    const pts = lastDays([daysAgo(4, 3), daysAgo(3, 3.2)], CHART_DAYS, NOW);

    expect(dayChange(pts, NOW)).toBeNull();
  });
});
