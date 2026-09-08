import { describe, expect, test } from 'vitest';
import { gaugeGeometry } from '../src/services/riverGauge';
import type { WaterLevel } from '../src/types';

// Overrides are spread rather than passed positionally: a default parameter
// also fires on an explicit `undefined`, which silently gave the "no
// evacuation height" case an evacuation height.
const at = (level: number, over: Partial<WaterLevel> = {}): WaterLevel => ({
  stationId: 'rosario',
  timestamp: new Date('2026-09-08T12:00:00Z'),
  level,
  trend: 'stable',
  changeRate: 0,
  alertLevel: 5,
  evacuationLevel: 5.3,
  ...over,
});

describe('gaugeGeometry', () => {
  test('says nothing without a reference height to measure against', () => {
    // A bar from zero to nowhere tells the reader less than the number alone.
    expect(gaugeGeometry({ ...at(2.42), alertLevel: undefined })).toBeNull();
  });

  test('fills in proportion to the level', () => {
    expect(gaugeGeometry(at(2.42))!.fill).toBeCloseTo((2.42 / (5.3 * 1.08)) * 100, 5);
  });

  test('places alert and evacuation on the same scale', () => {
    const g = gaugeGeometry(at(2.42))!;

    expect(g.alertAt).toBeCloseTo((5 / (5.3 * 1.08)) * 100, 5);
    expect(g.evacAt).toBeCloseTo((5.3 / (5.3 * 1.08)) * 100, 5);
    expect(g.alertAt).toBeLessThan(g.evacAt!);
  });

  test('takes its state from the alert logic the app already had', () => {
    // Duplicating the thresholds here is how the bar and the existing alert
    // pill would end up disagreeing on the same screen.
    expect(gaugeGeometry(at(2.42))!.status).toBe('normal');
    expect(gaugeGeometry(at(4.2))!.status).toBe('near-alert');
    expect(gaugeGeometry(at(5))!.status).toBe('alert');
    expect(gaugeGeometry(at(5.3))!.status).toBe('evacuation');
  });

  test('keeps the fill inside the bar when the river is over the top', () => {
    expect(gaugeGeometry(at(9))!.fill).toBe(100);
  });

  test('flags a river below the hydrometric zero, which an empty bar cannot', () => {
    const g = gaugeGeometry(at(-0.4))!;

    expect(g.fill).toBe(0);
    expect(g.belowZero).toBe(true);
  });

  test('works from the alert height alone when no evacuation is published', () => {
    const g = gaugeGeometry({ ...at(3), evacuationLevel: undefined })!;

    expect(g.evacAt).toBeNull();
    expect(g.alertAt).toBeGreaterThan(0);
  });

  test('matches the geometry the website draws for the same reading', () => {
    // The two are separate implementations — one TypeScript in the app, one
    // plain JavaScript inlined into the pages — so the numbers are pinned here
    // to the same expectations the landing suite asserts.
    const g = gaugeGeometry(at(2.42))!;

    expect(Number(g.fill.toFixed(2))).toBe(42.28);
    expect(Number(g.alertAt.toFixed(2))).toBe(87.35);
    expect(Number(g.evacAt!.toFixed(2))).toBe(92.59);
  });
});
