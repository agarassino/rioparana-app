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
