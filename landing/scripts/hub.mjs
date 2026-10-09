// Shared rendering for the dynamic parts of the /rio/ hub: the lead answer
// sentence, the full station table, the meta description and the FAQ.
//
// Pure and synchronous, no FS/network: build-directory.mjs calls this with a
// build-time snapshot (one reading per station, no reliable daily delta), and
// scripts/refresh-river-landing.mjs calls it again after the daily INA fetch
// (which does have a genuine delta, see its hubDailyDelta() — anchored on each
// reading's own timestamp, not on "now", so it is the same regardless of what
// hour the refresh job runs). Both callers hand it the same StationReading
// shape:
//
//   {
//     slug, nombre,
//     level: number|null,         // metres
//     state: 'normal'|'near-alert'|'alert'|'evacuation'|null,  // gauge.mjs
//     deltaCm: number|null,       // signed cm change vs. ~24h before the
//                                 // reading's own timestamp, or null
//     measuredAtIso: string|null,    // YYYY-MM-DD
//     measuredAtProsa: string|null,  // "8 de octubre de 2026"
//     ownStation: boolean,        // has its own gauge, vs. a borrowed reading
//   }
//
// so the two renders can never disagree about what the hub looks like.

import { listar } from './directory.mjs';

const comma = (n) => String(n).replace('.', ',');
const fmtLevel = (level) => `${comma(level.toFixed(2))} m`;

const STATE_LABEL = {
  normal: 'Normal',
  'near-alert': 'Cerca de alerta',
  alert: 'Alerta',
  evacuation: 'Evacuación',
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Editorial order for the lead sentence: a Paraná Medio/Alto reference
// (Corrientes), the Paraná Inferior (Rosario) and, when it has data, a Delta
// station. Zárate is the fallback when San Fernando has nothing to say.
const HEADLINE_SLUGS = ['corrientes', 'rosario', 'san-fernando', 'zarate'];
const HEADLINE_MAX = 3;

/** Up to HEADLINE_MAX readings with an actual level, in HEADLINE_SLUGS order. */
export function pickHeadline(readings) {
  const bySlug = new Map(readings.map((r) => [r.slug, r]));
  const picked = [];
  for (const slug of HEADLINE_SLUGS) {
    const r = bySlug.get(slug);
    if (r && Number.isFinite(r.level)) picked.push(r);
    if (picked.length >= HEADLINE_MAX) break;
  }
  return picked;
}

/** The most recent measuredAtIso/Prosa among a list of readings, or null. */
function freshestDate(list) {
  let best = null;
  for (const r of list) {
    if (!r.measuredAtIso) continue;
    if (!best || r.measuredAtIso > best.measuredAtIso) best = r;
  }
  return best;
}

// A delta smaller than this reads as noise, not movement — the river "se
// mantiene" rather than counting as a rise or a fall either way.
export const STABLE_THRESHOLD_CM = 2;

// Below this fraction of stations actually carrying a delta (see
// scripts/refresh-river-landing.mjs's hubDailyDelta(), anchored on each
// reading's own timestamp rather than on "now" so coverage does not depend on
// what hour the refresh job happens to run), the suben/bajan/mantienen clause
// would describe "the river" from a minority of it — omit it entirely rather
// than imply more coverage than the data supports.
const DELTA_COVERAGE_THRESHOLD = 2 / 3;

/** "1 estación sube" / "5 suben" — singular keeps the noun, plural drops it. */
function countClause(n, singularVerb, pluralVerb) {
  return n === 1 ? `1 estación ${singularVerb}` : `${n} ${pluralVerb}`;
}

/**
 * The lead sentence at the top of the hub, baked from the same readings the
 * table renders. Returns null when there is nothing honest to say (no
 * reference station has a level) — never a sentence with invented numbers.
 */
export function hubAnswer(readings) {
  const headline = pickHeadline(readings);
  if (!headline.length) return null;

  const parts = headline.map((r) => `${fmtLevel(r.level)} en ${r.nombre}`);
  let text = `Hoy el Paraná marca ${listar(parts)}`;

  // Only counts actual stations (not a locality borrowing its neighbour's
  // reading), so these numbers never double-count one station's movement.
  const stations = readings.filter((r) => r.ownStation);
  const withDelta = stations.filter((r) => r.deltaCm !== null);
  if (stations.length > 0 && withDelta.length / stations.length >= DELTA_COVERAGE_THRESHOLD) {
    const up = withDelta.filter((r) => r.deltaCm >= STABLE_THRESHOLD_CM).length;
    const down = withDelta.filter((r) => r.deltaCm <= -STABLE_THRESHOLD_CM).length;
    const stable = withDelta.length - up - down;
    // The total quoted is the number of stations the clause actually sums
    // over, not the full roster — so it is never a sentence about stations
    // that had nothing to report.
    const total = withDelta.length === 1 ? '1 estación' : `${withDelta.length} estaciones`;
    text += `; de ${total}, ${countClause(up, 'sube', 'suben')}, ` +
      `${countClause(down, 'baja', 'bajan')} y ${countClause(stable, 'se mantiene', 'se mantienen')}`;
  }

  const freshest = freshestDate(headline);
  if (freshest) text += ` (medición de Prefectura del ${freshest.measuredAtProsa})`;

  return `${text}.`;
}

/** Meta description: the same headline numbers and date, truncated at 160. */
export function hubDescription({ count, readings, dateProsa }) {
  const base = `Altura del río Paraná hoy en ${count} estaciones, del Alto Paraná al Delta, según Prefectura Naval Argentina.`;
  const headline = pickHeadline(readings).slice(0, 2);
  if (!headline.length) return base;

  const nums = headline.map((r) => `${r.nombre} ${fmtLevel(r.level)}`).join(' y ');
  const dateClause = dateProsa ? ` al ${dateProsa}` : '';
  const core = `Altura del río Paraná hoy: ${nums}${dateClause}, según Prefectura Naval Argentina.`;
  const withCount = `${core} ${count} estaciones, del Alto Paraná al Delta.`;

  if (withCount.length <= 160) return withCount;
  if (core.length <= 160) return core;
  return base;
}

function deltaCell(deltaCm) {
  if (deltaCm === null || deltaCm === undefined) return '—';
  // Same ±2cm "se mantiene" band hubAnswer() counts by, so the table and the
  // lead sentence can never disagree about whether a station moved.
  if (Math.abs(deltaCm) < STABLE_THRESHOLD_CM) {
    return '<span class="hub-delta" data-dir="flat">Sin cambios</span>';
  }
  const dir = deltaCm > 0 ? 'up' : 'down';
  const arrow = deltaCm > 0 ? '▲' : '▼';
  return `<span class="hub-delta" data-dir="${dir}">${arrow} ${Math.abs(deltaCm)} cm</span>`;
}

/**
 * The full station table, one row per reading, in the order given (callers
 * pass `published`, already north→south via directory.mjs's riverOrder).
 * Semantic table: caption + scoped headers, so it stands on its own without
 * the surrounding page. Wrapped so it scrolls on its own at narrow widths
 * instead of pushing the page wider than the viewport.
 */
export function hubTable(readings) {
  const rows = readings.map((r) => {
    const altura = Number.isFinite(r.level) ? fmtLevel(r.level) : '—';
    const estado = r.state
      ? `<span class="hub-state" data-state="${esc(r.state)}">${esc(STATE_LABEL[r.state] ?? r.state)}</span>`
      : '—';
    const fecha = r.measuredAtIso
      ? `<time datetime="${esc(r.measuredAtIso)}">${esc(r.measuredAtProsa ?? r.measuredAtIso)}</time>`
      : '—';

    return `<tr><th scope="row"><a href="/rio/${esc(r.slug)}/">${esc(r.nombre)}</a></th>` +
      `<td>${altura}</td><td>${deltaCell(r.deltaCm)}</td><td>${estado}</td><td>${fecha}</td></tr>`;
  }).join('');

  return `<div class="table-wrap"><table class="hub-table">` +
    `<caption>Altura del río Paraná por localidad, del Alto Paraná al Delta</caption>` +
    `<thead><tr><th scope="col">Localidad</th><th scope="col">Altura</th>` +
    `<th scope="col">Variación diaria</th><th scope="col">Estado</th><th scope="col">Medición</th></tr></thead>` +
    `<tbody>${rows}</tbody></table></div>`;
}

// Static FAQ content: truthful about what actually ships (daily bake + a live
// client-side repaint on each locality page — see riverScript() in
// build-directory.mjs), not a promise of real-time data on the hub itself.
export const HUB_FAQ = [
  {
    q: '¿Dónde se publica la altura oficial de los ríos?',
    a: 'La altura oficial la publica la Prefectura Naval Argentina. Paraná Info es una aplicación independiente y no está afiliada a ningún organismo público: tomamos ese dato público y lo mostramos por localidad.',
  },
  {
    q: '¿Cada cuánto se actualiza?',
    a: 'Esta página se actualiza una vez por día con la lectura de la Prefectura. En la ficha de cada localidad, el valor se repinta en vivo apenas se abre la página.',
  },
  {
    q: '¿Qué significa nivel de alerta y evacuación?',
    a: 'Son las alturas a partir de las cuales la Prefectura declara alerta o evacuación en cada estación. Por debajo de esos valores el río está en nivel normal.',
  },
];

export function hubFaqHtml() {
  return HUB_FAQ.map(({ q, a }) =>
    `<details class="faq-item"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`
  ).join('');
}

export function hubFaqJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: HUB_FAQ.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}
