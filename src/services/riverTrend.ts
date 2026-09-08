// Where the river has been, not only where it is.
//
// The website computes the same curve from landing/scripts/sparkline.mjs, which
// is plain JavaScript because it is inlined into the served HTML. This one is
// TypeScript because it goes through Metro. The two are held to the same
// behaviours by test/sparkline.test.ts and test/riverTrend.test.ts — change one
// and the other has to follow.

export const CHART_DAYS = 7;

const HOUR = 3600_000;
// The newest reading has to be recent enough that "since yesterday" means
// yesterday, and the reference far enough back to answer the question.
const MAX_STALE_H = 12;
const MIN_SPAN_H = 12;
const MAX_SPAN_H = 36;

export interface Reading {
  timestamp: string;
  level: number;
  at: number;
}

export interface Box {
  width: number;
  height: number;
  padding?: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface SparkLine {
  points: Point[];
  min: number;
  max: number;
  first: number;
  last: number;
  from: number;
  to: number;
  count: number;
}

export interface DayChange {
  /** Centimetres, signed. */
  cm: number;
  /** The span actually compared, near but rarely exactly 24. */
  hours: number;
}

// Number(null) and Number('') are both 0, which is a plausible river height. A
// missing level has to fail the finite check, not enter the scale as zero.
const num = (v: unknown): number =>
  v === null || v === undefined || v === '' ? NaN : Number(v);

/** Readings inside the window, oldest first, with the unusable ones dropped. */
export function lastDays(points: unknown, days: number, now: Date = new Date()): Reading[] {
  const cutoff = now.getTime() - days * 24 * HOUR;

  return (Array.isArray(points) ? points : [])
    .map((p) => ({
      level: num(p?.level),
      at: new Date(p?.timestamp ?? '').getTime(),
    }))
    .filter((p) => Number.isFinite(p.level) && Number.isFinite(p.at) && p.at >= cutoff)
    .sort((a, b) => a.at - b.at)
    .map((p) => ({ timestamp: new Date(p.at).toISOString(), level: p.level, at: p.at }));
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Geometry for the curve, or null when there is nothing a line could say. */
export function sparkPath(points: Reading[], { width, height, padding = 4 }: Box): SparkLine | null {
  const pts = [...(points ?? [])].sort((a, b) => a.at - b.at);
  if (pts.length < 2) return null;

  const levels = pts.map((p) => p.level);
  const min = Math.min(...levels);
  const max = Math.max(...levels);
  // A week that never moved is a real answer, not an error: draw it level.
  const flat = max === min;
  const y = (level: number) =>
    flat ? height / 2 : padding + ((max - level) / (max - min)) * (height - 2 * padding);

  const t0 = pts[0].at;
  const span = pts[pts.length - 1].at - t0;
  // Time-proportional, so a day the pusher was offline reads as a long straight
  // run rather than a tidy step it never took.
  const x = (at: number, i: number) =>
    span > 0
      ? padding + ((at - t0) / span) * (width - 2 * padding)
      : padding + (i / (pts.length - 1)) * (width - 2 * padding);

  return {
    points: pts.map((p, i) => ({ x: round(x(p.at, i)), y: round(y(p.level)) })),
    min,
    max,
    first: pts[0].level,
    last: pts[pts.length - 1].level,
    from: t0,
    to: pts[pts.length - 1].at,
    count: pts.length,
  };
}

/** One sentence for a reader who will not decode a curve. */
export function trendSummary(line: SparkLine | null): string {
  if (!line) return '';

  const cm = Math.round((line.last - line.first) * 100);
  const days = Math.round((line.to - line.from) / (24 * HOUR));
  const span = days >= 1 ? `${days} ${days === 1 ? 'día' : 'días'}` : 'las últimas horas';

  // Prefectura publishes centimetres. Under one is noise in the reading, not a
  // river that moved.
  if (cm === 0) return `Estable en ${days >= 1 ? `los últimos ${span}` : span}`;

  return `${cm > 0 ? 'Subió' : 'Bajó'} ${Math.abs(cm)} cm en ${span}`;
}

/** How far the river moved over roughly the last day, or null if it cannot say. */
export function dayChange(points: Reading[], now: Date = new Date(), hours = 24): DayChange | null {
  const pts = points ?? [];
  if (pts.length < 2) return null;

  const latest = pts[pts.length - 1];
  if ((now.getTime() - latest.at) / HOUR > MAX_STALE_H) return null;

  const target = latest.at - hours * HOUR;
  let ref: Reading | null = null;
  for (const p of pts.slice(0, -1)) {
    if (ref === null || Math.abs(p.at - target) < Math.abs(ref.at - target)) ref = p;
  }
  if (!ref) return null;

  const span = (latest.at - ref.at) / HOUR;
  if (span < MIN_SPAN_H || span > MAX_SPAN_H) return null;

  return { cm: Math.round((latest.level - ref.level) * 100), hours: Math.round(span) };
}
