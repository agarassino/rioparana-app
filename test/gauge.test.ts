import { describe, expect, test } from 'vitest';
import { gauge, gaugeHtml, marginLabel } from '../landing/scripts/gauge.mjs';

const rosario = { level: 2.42, alertLevel: 5, evacuationLevel: 5.3 };

describe('gauge', () => {
  test('says nothing without a reference height to measure against', () => {
    // A bar from zero to nowhere tells the reader less than the number alone.
    expect(gauge({ level: 2.42 })).toBeNull();
    expect(gauge({ level: null, alertLevel: 5 })).toBeNull();
  });

  test('fills in proportion to the level', () => {
    const g = gauge(rosario)!;

    // Scale runs 0 to evacuation plus a margin, so the top mark is not welded
    // to the end of the bar.
    expect(g.fill).toBeCloseTo((2.42 / (5.3 * 1.08)) * 100, 5);
  });

  test('places alert and evacuation on the same scale', () => {
    const g = gauge(rosario)!;

    expect(g.alertAt).toBeCloseTo((5 / (5.3 * 1.08)) * 100, 5);
    expect(g.evacAt).toBeCloseTo((5.3 / (5.3 * 1.08)) * 100, 5);
    expect(g.alertAt).toBeLessThan(g.evacAt!);
  });

  test('reads as normal when the river is well below alert', () => {
    expect(gauge(rosario)!.state).toBe('normal');
  });

  test('warns within a metre of alert, matching what the app already calls near', () => {
    expect(gauge({ ...rosario, level: 4.2 })!.state).toBe('near-alert');
    expect(gauge({ ...rosario, level: 3.9 })!.state).toBe('normal');
  });

  test('names the two states that matter', () => {
    expect(gauge({ ...rosario, level: 5 })!.state).toBe('alert');
    expect(gauge({ ...rosario, level: 5.3 })!.state).toBe('evacuation');
  });

  test('keeps the fill inside the bar when the river is over the top', () => {
    const g = gauge({ ...rosario, level: 9 })!;

    expect(g.fill).toBe(100);
    expect(g.state).toBe('evacuation');
  });

  test('flags a river below the hydrometric zero, which an empty bar cannot', () => {
    // In a hard bajante the level goes negative. The bar empties either way,
    // so -0.40 m and 0.00 m look identical: the flag is what lets the page
    // tell them apart in words.
    const g = gauge({ ...rosario, level: -0.4 })!;

    expect(g.fill).toBe(0);
    expect(g.belowZero).toBe(true);
    expect(gauge(rosario)!.belowZero).toBe(false);
  });

  test('works from the alert height alone when no evacuation is published', () => {
    const g = gauge({ level: 3, alertLevel: 5 })!;

    expect(g.evacAt).toBeNull();
    expect(g.alertAt).toBeGreaterThan(0);
  });
});

describe('marginLabel', () => {
  test('says how much room is left', () => {
    expect(marginLabel(gauge(rosario)!)).toBe('A 2.58 m del nivel de alerta');
  });

  test('stops counting down once the river is over it', () => {
    expect(marginLabel(gauge({ ...rosario, level: 5.1 })!)).toBe('Supera el nivel de alerta');
  });

  test('names evacuation when the river reaches it', () => {
    expect(marginLabel(gauge({ ...rosario, level: 5.4 })!)).toBe('Supera el nivel de evacuación');
  });

  test('says nothing without a gauge', () => {
    expect(marginLabel(null)).toBe('');
  });
});

describe('gaugeHtml', () => {
  test('returns nothing to render when there is no gauge', () => {
    expect(gaugeHtml(null)).toBe('');
  });

  test('sets the fill width and both marks from the geometry', () => {
    const g = gauge(rosario)!;
    const html = gaugeHtml(g);

    expect(html).toContain(`width:${g.fill.toFixed(2)}%`);
    expect(html).toContain(`left:${g.alertAt.toFixed(2)}%`);
    expect(html).toContain(`left:${g.evacAt!.toFixed(2)}%`);
  });

  test('carries the state so the bar can turn red on its own', () => {
    expect(gaugeHtml(gauge({ ...rosario, level: 5.1 })!)).toContain('data-state="alert"');
  });

  test('describes itself for a reader who cannot see the bar', () => {
    // The bar is the whole point of the redesign, so it cannot be invisible to
    // a screen reader.
    const html = gaugeHtml(gauge(rosario)!);

    expect(html).toContain('role="img"');
    expect(html).toMatch(/aria-label="[^"]*2\.42 m[^"]*5\.00 m[^"]*"/);
  });

  test('anchors a label that would otherwise hang off the end of the bar', () => {
    // Evacuation defines the top of the scale, so its label is always in the
    // end zone; alert is usually just below it.
    const html = gaugeHtml(gauge(rosario)!);

    expect(html).toContain('gauge-mark-alert gauge-mark-end');
    expect(html).toContain('gauge-mark-evac gauge-mark-end');
  });

  test('leaves a label centred while it still fits', () => {
    // A station whose alert height sits low on its own scale: only the
    // evacuation label needs anchoring there.
    const html = gaugeHtml(gauge({ level: 1, alertLevel: 2, evacuationLevel: 9 })!);

    expect(html).toContain('class="gauge-mark gauge-mark-alert"');
    expect(html).toContain('gauge-mark-evac gauge-mark-end');
  });

  test('omits the evacuation mark when there is none to show', () => {
    expect(gaugeHtml(gauge({ level: 3, alertLevel: 5 })!)).not.toContain('gauge-mark-evac');
  });
});
