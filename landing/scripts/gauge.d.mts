// Contract for the river gauge. The implementation stays plain JavaScript
// because the browser runs it verbatim, inlined into every locality page.

export interface GaugeInput {
  level: number | string | null | undefined;
  alertLevel?: number | string | null;
  evacuationLevel?: number | string | null;
}

export type GaugeState = 'normal' | 'near-alert' | 'alert' | 'evacuation';

export interface Gauge {
  /** Percentage of the track filled, clamped to 0-100. */
  fill: number;
  alertAt: number;
  /** null when the station publishes no evacuation height. */
  evacAt: number | null;
  state: GaugeState;
  level: number;
  alertLevel: number;
  evacuationLevel: number | null;
  /** The bar empties either way, so this is what distinguishes -0.40 from 0.00. */
  belowZero: boolean;
  hi: number;
}

export function gauge(input: GaugeInput): Gauge | null;
export function marginLabel(g: Gauge | null): string;
export function gaugeHtml(g: Gauge | null): string;
