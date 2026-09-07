// The river height drawn as a scale.
//
// "2.42 m" answers nothing on its own: a reader cannot tell whether that is a
// river to worry about. Against the heights at which Prefectura declares alert
// and evacuation, the same number answers in a glance. Pure geometry, no DOM:
// baked into the page at build time and recomputed in the browser from the
// same file, so the two can never disagree.

// The margin the app already uses to call a river "close to alert".
const NEAR_ALERT_M = 1;
// Headroom above evacuation so the top mark is not welded to the bar's end.
const HEADROOM = 1.08;

const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));

/** Geometry and state, or null when there is no reference to measure against. */
export function gauge({ level, alertLevel, evacuationLevel } = {}) {
  const l = num(level);
  const alert = num(alertLevel);
  const evac = num(evacuationLevel);
  if (!Number.isFinite(l) || !Number.isFinite(alert)) return null;

  const top = (Number.isFinite(evac) ? evac : alert) * HEADROOM;
  // The scale runs from the hydrometric zero, which is the datum every one of
  // these readings is quoted against. A hard bajante goes below it; the bar
  // empties and `belowZero` lets the page say so in words, because an empty
  // bar cannot distinguish -0.40 m from 0.00 m on its own.
  const hi = Math.max(top, l);
  const pos = (v) => (v / hi) * 100;

  const state = Number.isFinite(evac) && l >= evac
    ? 'evacuation'
    : l >= alert
      ? 'alert'
      : alert - l <= NEAR_ALERT_M
        ? 'near-alert'
        : 'normal';

  return {
    fill: Math.max(0, Math.min(100, pos(l))),
    alertAt: pos(alert),
    evacAt: Number.isFinite(evac) ? pos(evac) : null,
    state,
    level: l,
    alertLevel: alert,
    evacuationLevel: Number.isFinite(evac) ? evac : null,
    belowZero: l < 0,
    hi,
  };
}

/** The sentence under the bar: how much room is left, or that there is none. */
export function marginLabel(g) {
  if (!g) return '';
  if (g.state === 'evacuation') return 'Supera el nivel de evacuación';
  if (g.state === 'alert') return 'Supera el nivel de alerta';

  return `A ${(g.alertLevel - g.level).toFixed(2)} m del nivel de alerta`;
}

const pct = (n) => `${n.toFixed(2)}%`;
const m = (n) => `${n.toFixed(2)} m`;

// Past this point on the track a centred label hangs off the right edge, so it
// is anchored to its mark instead.
const END_ZONE = 70;
const endClass = (at) => (at > END_ZONE ? ' gauge-mark-end' : '');

/** The bar as markup. Pure, so it is testable without a browser. */
export function gaugeHtml(g) {
  if (!g) return '';

  const label =
    `Nivel ${m(g.level)}. Alerta a ${m(g.alertLevel)}` +
    (g.evacuationLevel === null ? '' : `, evacuación a ${m(g.evacuationLevel)}`) + '.';

  const evac = g.evacAt === null
    ? ''
    : `<span class="gauge-mark gauge-mark-evac${endClass(g.evacAt)}" style="left:${pct(g.evacAt)}">` +
      `<i></i><b>Evacuación ${m(g.evacuationLevel)}</b></span>`;

  return (
    `<div class="gauge" role="img" aria-label="${label}">` +
    `<div class="gauge-track">` +
    `<div class="gauge-fill" data-state="${g.state}" style="width:${pct(g.fill)}"></div>` +
    `<span class="gauge-mark gauge-mark-alert${endClass(g.alertAt)}" style="left:${pct(g.alertAt)}">` +
    `<i></i><b>Alerta ${m(g.alertLevel)}</b></span>${evac}` +
    `</div></div>`
  );
}
