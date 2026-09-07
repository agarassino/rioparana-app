// Contract for the chart maths. The implementation stays plain JavaScript
// because the browser runs it verbatim, inlined into every locality page.

export const CHART_DAYS: number;

export interface Reading {
  timestamp: string;
  level: number;
  /** Epoch millis, filled in by lastDays so sparkline need not reparse. */
  at?: number;
}

export interface Box {
  width: number;
  height: number;
  padding?: number;
  /** Drawn as a rule only when it shares an axis with the readings. */
  alertLevel?: number | null;
}

export interface Line {
  /** SVG points list: "x,y x,y …". */
  path: string;
  width: number;
  height: number;
  min: number;
  max: number;
  first: number;
  last: number;
  from: string;
  to: string;
  count: number;
  /** null when the alert height is too far above the readings to plot. */
  alertY: number | null;
}

export function lastDays(points: unknown, days: number, now?: Date): Reading[];
export function sparkline(points: readonly Reading[] | null, box: Box): Line | null;
export function trendSummary(line: Line | null): string;
export function chartSvg(line: Line | null): string;
export function scaleLabel(line: Line | null): string;
export function rangeLabel(line: Line | null, fmtDay: (iso: string) => string): string;

export interface DayChange {
  /** Centimetres, signed. */
  cm: number;
  /** The span actually compared, which is near but rarely exactly 24. */
  hours: number;
}

export interface DayBadge {
  dir: 'up' | 'down' | 'flat';
  text: string;
  detail: string;
}

export function dayChange(
  points: readonly Reading[] | null, now?: Date, hours?: number
): DayChange | null;
export function dayBadge(change: DayChange | null): DayBadge | null;
