import { WaterLevel } from '../types';

// Prefectura publishes an alert and an evacuation height for each station. On
// their own the heights mean little; what a reader wants to know is how much
// room is left before the river reaches them.

// How close the river has to get before it is worth flagging.
export const NEAR_ALERT_MARGIN_M = 1;

export type AlertStatus = 'normal' | 'near-alert' | 'alert' | 'evacuation';

export interface AlertInfo {
  status: AlertStatus;
  /** Metres left before the alert height. Negative once the river is past it. */
  metersToAlert: number;
}

export function getAlertInfo(level: WaterLevel): AlertInfo | null {
  const { alertLevel, evacuationLevel } = level;
  if (alertLevel === undefined || !Number.isFinite(alertLevel)) return null;

  const metersToAlert = alertLevel - level.level;

  if (evacuationLevel !== undefined && level.level >= evacuationLevel) {
    return { status: 'evacuation', metersToAlert };
  }
  if (level.level >= alertLevel) {
    return { status: 'alert', metersToAlert };
  }
  if (metersToAlert <= NEAR_ALERT_MARGIN_M) {
    return { status: 'near-alert', metersToAlert };
  }
  return { status: 'normal', metersToAlert };
}
