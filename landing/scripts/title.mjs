// <title> for the /rio/<locality>/ pages, shared by the generator
// (build-directory.mjs) and the daily patcher (scripts/refresh-river-landing.mjs)
// so the two can never disagree about its shape.
//
// With a reading, the title leads with the number a searcher is looking for:
//   "Río Paraná en Rosario hoy: 2,94 m (alerta 5 m) — Prefectura"
// Without one it falls back to the static, data-free wording.

const MAX_LEN = 65;

/** One decimal comma, no trailing zeros: 4.70 -> "4,7", 5 -> "5". */
const comma = (n) => String(Number(n)).replace('.', ',');

/**
 * @param {object} p
 * @param {string} p.nombre    locality name; a trailing "(Provincia)" is dropped
 *                             when a reading exists (it only disambiguates the
 *                             static fallback, and costs 14 characters)
 * @param {number|null} p.level        current reading in metres, or null
 * @param {number|null} p.alertLevel   alert threshold in metres, or null
 * @param {string} [p.fallback]        title to use when there is no reading
 */
export function riverTitle({ nombre, level, alertLevel, fallback }) {
  const lvl = level === null || level === undefined || level === '' ? NaN : Number(level);
  if (!Number.isFinite(lvl)) {
    return fallback ?? `Altura del río Paraná en ${nombre} hoy — Prefectura Naval | Paraná Info`;
  }

  const short = nombre.replace(/\s*\([^)]*\)\s*$/, '');
  const alert = alertLevel === null || alertLevel === undefined || alertLevel === '' ? NaN : Number(alertLevel);
  const head = `Río Paraná en ${short} hoy: ${lvl.toFixed(2).replace('.', ',')} m` +
    (Number.isFinite(alert) ? ` (alerta ${comma(alert)} m)` : '');
  const full = `${head} — Prefectura`;
  return full.length <= MAX_LEN ? full : head;
}

/**
 * <title> for the /rio/ hub: the intent ("altura hoy") plus how many stations
 * answer it, with today's date appended only when it still fits under
 * MAX_LEN. Shared by build-directory.mjs (indexPage) and the daily refresh
 * (scripts/refresh-river-landing.mjs), so both can only ever produce the one
 * shape this function defines.
 *
 * @param {object} p
 * @param {number} p.count            stations with their own gauge (not every
 *                                    published locality — see build-directory.mjs)
 * @param {string|null} [p.dateProsa] "8 de octubre de 2026", or omitted/null
 */
export function hubTitle({ count, dateProsa }) {
  const base = `Altura del río Paraná hoy: ${count} estaciones`;
  const withDate = dateProsa ? `${base}, ${dateProsa} — Prefectura` : null;
  if (withDate && withDate.length <= MAX_LEN) return withDate;

  const withBrand = `${base} — Prefectura`;
  return withBrand.length <= MAX_LEN ? withBrand : base;
}
