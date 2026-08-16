import { describe, expect, test } from 'vitest';
import { NEAR_ALERT_MARGIN_M, getAlertInfo } from '../src/services/riverAlert';
import type { WaterLevel } from '../src/types';

function level(overrides: Partial<WaterLevel> = {}): WaterLevel {
  return {
    stationId: 'rosario',
    level: 3,
    trend: 'stable',
    changeRate: 0,
    timestamp: new Date('2026-08-14T15:00:00.000Z'),
    alertLevel: 5,
    evacuationLevel: 5.3,
    ...overrides,
  };
}

describe('getAlertInfo', () => {
  test('returns nothing when the station publishes no alert height', () => {
    expect(getAlertInfo(level({ alertLevel: undefined }))).toBeNull();
  });

  test('reports how far the river is from the alert height', () => {
    expect(getAlertInfo(level({ level: 3 }))?.metersToAlert).toBeCloseTo(2, 5);
  });

  test('calls a river well below the alert height normal', () => {
    expect(getAlertInfo(level({ level: 3 }))?.status).toBe('normal');
  });

  test('warns once the river is within the near-alert margin', () => {
    const info = getAlertInfo(level({ level: 5 - NEAR_ALERT_MARGIN_M + 0.01 }));

    expect(info?.status).toBe('near-alert');
  });

  test('reports alert once the river reaches the alert height', () => {
    expect(getAlertInfo(level({ level: 5 }))?.status).toBe('alert');
  });

  test('reports evacuation once the river reaches the evacuation height', () => {
    expect(getAlertInfo(level({ level: 5.3 }))?.status).toBe('evacuation');
  });

  test('reports a negative distance when the river is above the alert height', () => {
    expect(getAlertInfo(level({ level: 5.5 }))?.metersToAlert).toBeCloseTo(-0.5, 5);
  });

  test('still reports alert when no evacuation height is published', () => {
    const info = getAlertInfo(level({ level: 6, evacuationLevel: undefined }));

    expect(info?.status).toBe('alert');
  });

  test('matches the real Posadas reading, which sits close to alert', () => {
    const info = getAlertInfo(level({ stationId: 'posadas', level: 10.08, alertLevel: 11, evacuationLevel: 12 }));

    expect(info?.status).toBe('near-alert');
    expect(info?.metersToAlert).toBeCloseTo(0.92, 5);
  });
});
