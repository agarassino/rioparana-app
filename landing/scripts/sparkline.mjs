// Geometry for the river-level sparkline.
//
// Pure functions, no DOM: the build script imports them to bake a static SVG,
// and the browser imports the same code to redraw with fresh readings. Keeping
// the maths here means the two paths cannot disagree about what a curve means.

export const CHART_DAYS = 7;

// The alert height only earns a line when it is close enough to the readings to
// share an axis with them. Rosario alerts at 5 m and runs near 3 m: forcing
// that onto the scale would pin the whole week flat against the floor.
const ALERT_MARGIN_M = 0.5;

// Number(null) and Number('') are both 0, which is a plausible-looking river
// height. A missing level has to fail the finite check, not slip through as a
// reading of zero metres and drag the whole scale down with it.
const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));

/** Readings from the last `days`, oldest first, with the unusable ones dropped. */
export function lastDays(points, days, now = new Date()) {
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;

  return (points ?? [])
    .map((p) => ({ level: num(p?.level), at: new Date(p?.timestamp ?? '').getTime() }))
    .filter((p) => Number.isFinite(p.level) && Number.isFinite(p.at) && p.at >= cutoff)
    .sort((a, b) => a.at - b.at)
    .map((p) => ({ timestamp: new Date(p.at).toISOString(), level: p.level, at: p.at }));
}

const round = (n) => Math.round(n * 10) / 10;

/**
 * Turns readings into a polyline for a `width` x `height` viewBox.
 * Returns null when there is nothing a line could say.
 */
export function sparkline(points, { width, height, padding = 4, alertLevel } = {}) {
  // Sorted here as well as in lastDays: out-of-order input would make the time
  // span negative and fold the curve back over itself, silently.
  const pts = (points ?? [])
    .map((p) => ({ level: num(p.level), at: p.at ?? new Date(p.timestamp).getTime() }))
    .filter((p) => Number.isFinite(p.level) && Number.isFinite(p.at))
    .sort((a, b) => a.at - b.at);
  if (pts.length < 2) return null;

  const levels = pts.map((p) => p.level);
  const min = Math.min(...levels);
  const max = Math.max(...levels);
  const usableH = height - 2 * padding;
  const usableW = width - 2 * padding;

  // A week that never moved is a real answer, not an error: draw it level.
  const flat = max === min;
  const y = (level) => (flat ? height / 2 : padding + ((max - level) / (max - min)) * usableH);

  const t0 = pts[0].at;
  const span = pts[pts.length - 1].at - t0;
  // Time-proportional, so a day the pusher was offline reads as a long
  // straight run rather than a tidy step it never took.
  const x = (at, i) =>
    span > 0 ? padding + ((at - t0) / span) * usableW : padding + (i / (pts.length - 1)) * usableW;

  const path = pts.map((p, i) => `${round(x(p.at, i))},${round(y(p.level))}`).join(' ');

  const alertInRange =
    Number.isFinite(Number(alertLevel)) && Number(alertLevel) <= max + ALERT_MARGIN_M && !flat;

  return {
    path,
    width,
    height,
    min,
    max,
    first: pts[0].level,
    last: pts[pts.length - 1].level,
    from: new Date(t0).toISOString(),
    to: new Date(pts[pts.length - 1].at).toISOString(),
    count: pts.length,
    alertY: alertInRange ? y(Number(alertLevel)) : null,
  };
}

/**
 * One sentence describing the movement, for readers who will not decode a
 * curve — and for the page when SVG never renders.
 */
export function trendSummary(line) {
  if (!line) return '';

  const cm = Math.round((line.last - line.first) * 100);
  const hours = (new Date(line.to) - new Date(line.from)) / 36e5;
  // Rounded, so a span of 2.9 days is not announced as 2.
  const days = Math.round(hours / 24);
  const span = days >= 1 ? `${days} ${days === 1 ? 'día' : 'días'}` : 'las últimas horas';

  // Prefectura publishes centimetres. Anything under one is noise in the
  // reading, not a river that moved.
  if (cm === 0) {
    if (days < 1) return `Estable en ${span}`;
    return days === 1 ? 'Estable en el último día' : `Estable en los últimos ${span}`;
  }

  return `${cm > 0 ? 'Subió' : 'Bajó'} ${Math.abs(cm)} cm en ${span}`;
}

// Attribute-safe: the label is generated text today, but an SVG built by string
// concatenation is one careless input away from an attribute that ends early.
const attr = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The chart as an SVG string. Pure, so it can be tested without a browser. */
export function chartSvg(line) {
  if (!line) return '';

  const { width: w, height: h } = line;
  const pts = line.path.split(' ');
  const x0 = pts[0].split(',')[0];
  const x1 = pts[pts.length - 1].split(',')[0];
  // Filled down to the baseline: the shape reads as a water level at a glance,
  // where a bare stroke reads as an abstract squiggle.
  const area = `M${x0},${h} L${pts.join(' L')} L${x1},${h} Z`;

  const alert =
    line.alertY === null
      ? ''
      : `<line class="trend-alert" x1="0" y1="${line.alertY}" x2="${w}" y2="${line.alertY}"/>`;

  // preserveAspectRatio="none" lets the curve fill any column width; the stroke
  // opts out of that scaling so it keeps its weight instead of smearing.
  return (
    `<svg class="trend-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" ` +
    `role="img" aria-label="${attr(trendSummary(line))}">` +
    `<path class="trend-area" d="${area}"/>${alert}` +
    `<polyline class="trend-line" vector-effect="non-scaling-stroke" points="${line.path}"/>` +
    `</svg>`
  );
}

/** "Mínima 2.80 m · máxima 3.40 m" — the numbers the curve alone cannot give. */
export function scaleLabel(line) {
  if (!line) return '';
  return `Mínima ${line.min.toFixed(2)} m · máxima ${line.max.toFixed(2)} m`;
}

/**
 * The span actually plotted and where it came from. `fmtDay` is injected so the
 * browser can use its own locale without dragging Intl into the tests.
 */
export function rangeLabel(line, fmtDay) {
  if (!line) return '';
  const n = line.count;
  return `${fmtDay(line.from)} — ${fmtDay(line.to)} · ${n} ${n === 1 ? 'medición' : 'mediciones'}` +
    ' de Prefectura Naval Argentina';
}

const HOUR = 36e5;
// The newest reading has to be recent enough that "since yesterday" means
// yesterday. A pusher that stopped days ago must not have its last two
// readings dressed up as today's movement.
const MAX_STALE_H = 12;
// Prefectura publishes about twice a day, so the reading nearest to 24 h back
// is rarely exactly 24 h back. Accept a real window around it and report the
// span that was actually compared.
const MIN_SPAN_H = 12;
const MAX_SPAN_H = 36;

/**
 * How far the river moved over roughly the last day.
 * Returns null whenever the readings cannot honestly answer that.
 */
export function dayChange(points, now = new Date(), hours = 24) {
  const pts = points ?? [];
  if (pts.length < 2) return null;

  const latest = pts[pts.length - 1];
  const latestAt = latest.at ?? new Date(latest.timestamp).getTime();
  if ((now.getTime() - latestAt) / HOUR > MAX_STALE_H) return null;

  const target = latestAt - hours * HOUR;
  let ref = null;
  for (const p of pts.slice(0, -1)) {
    const at = p.at ?? new Date(p.timestamp).getTime();
    if (ref === null || Math.abs(at - target) < Math.abs(ref.at - target)) ref = { ...p, at };
  }
  if (!ref) return null;

  const span = (latestAt - ref.at) / HOUR;
  if (span < MIN_SPAN_H || span > MAX_SPAN_H) return null;

  return { cm: Math.round((latest.level - ref.level) * 100), hours: Math.round(span) };
}

/** The change as an arrow, a phrase, and the span it covers. */
export function dayBadge(change) {
  if (!change) return null;

  const detail = `en las últimas ${change.hours} h`;
  if (change.cm === 0) return { dir: 'flat', text: 'Sin cambios', detail };

  return {
    dir: change.cm > 0 ? 'up' : 'down',
    text: `${change.cm > 0 ? 'Subió' : 'Bajó'} ${Math.abs(change.cm)} cm`,
    detail,
  };
}
