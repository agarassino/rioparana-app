import { WaterLevel } from '../types';
import { AlertStatus, getAlertInfo } from './riverAlert';

// The height drawn as a scale. "2.42 m" answers nothing on its own: a reader
// cannot tell whether that is a river to worry about. Against the heights at
// which Prefectura declares alert and evacuation, the same number answers in a
// glance.
//
// The website draws the same bar from landing/scripts/gauge.mjs. That one is
// plain JavaScript because it is inlined into the served HTML; this one is
// TypeScript because it goes through Metro. They are pinned to the same numbers
// in test/riverGauge.test.ts — change one and the other has to follow.

// Headroom above evacuation, so the top mark is not welded to the bar's end.
const HEADROOM = 1.08;

export interface GaugeGeometry {
  /** Percentage of the track filled, clamped to 0-100. */
  fill: number;
  alertAt: number;
  /** null when the station publishes no evacuation height. */
  evacAt: number | null;
  status: AlertStatus;
  /** The bar empties either way, so this distinguishes -0.40 m from 0.00 m. */
  belowZero: boolean;
}

export function gaugeGeometry(level: WaterLevel): GaugeGeometry | null {
  // The status comes from the alert logic the app already had, rather than a
  // second set of thresholds that could disagree with the pill beside it.
  const info = getAlertInfo(level);
  if (!info || level.alertLevel === undefined) return null;

  const evac = level.evacuationLevel;
  const top = (evac !== undefined && Number.isFinite(evac) ? evac : level.alertLevel) * HEADROOM;
  // The scale runs from the hydrometric zero, the datum every reading is
  // quoted against.
  const hi = Math.max(top, level.level);
  const pos = (v: number) => (v / hi) * 100;

  return {
    fill: Math.max(0, Math.min(100, pos(level.level))),
    alertAt: pos(level.alertLevel),
    evacAt: evac !== undefined && Number.isFinite(evac) ? pos(evac) : null,
    status: info.status,
    belowZero: level.level < 0,
  };
}
