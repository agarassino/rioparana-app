#!/usr/bin/env node
// Refresca la altura del río horneada en landing/rio/<slug>/index.html.
//
// Esas 39 páginas se generan una sola vez con landing/scripts/build-directory.mjs
// a partir de landing/data/*.json y de un fetch a la API propia
// (api.rioparana.com.ar/public/river). Ese backend depende de un scraper que
// solo corre a mano desde una IP argentina (ver scripts/push-river.sh), así que
// el dato horneado se queda viejo apenas alguien se olvida de correrlo.
//
// Este script no reconstruye las páginas: parchea in-place solo los cinco
// puntos que dependen del nivel del río (número, barra, margen, fuente+fecha, título,
// meta description), leyendo directo del INA (sin restricción de IP, sin el
// intermediario). Reusa landing/scripts/gauge.mjs -la misma lógica que ya
// corre en el navegador y en build-directory.mjs- para que el estado
// (data-state), el fill de la barra y el texto de margen nunca diverjan de lo
// que el sitio ya calcula en cualquier otro lugar.
//
// Idempotente por construcción: si el HTML resultante es igual al existente,
// no se escribe nada. Correrlo dos veces sin datos nuevos no debe tocar el
// working tree.

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gauge, marginLabel } from '../landing/scripts/gauge.mjs';
import { riverTitle } from '../landing/scripts/title.mjs';
import { isoDateAR, prosaDateAR } from '../landing/scripts/date-ar.mjs';
// Importing this is safe: build-directory.mjs's own side effects (network,
// filesystem) sit behind its isEntryPoint guard, same as this file's own
// main() below — see that guard's comment for why that contract matters here.
import { indexPage } from '../landing/scripts/build-directory.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LANDING_RIO = join(ROOT, 'landing/rio');
const HUB_PATH = join(ROOT, 'landing/rio/index.html');
const ESTACIONES_PATH = join(ROOT, 'scripts/ina-estaciones.json');

const INA_BASE = 'https://alerta.ina.gob.ar/a5/obs/puntual/series';
const LOOKBACK_DAYS = 7;
const MAX_CONCURRENCY = 6;
const FETCH_TIMEOUT_MS = 15_000;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ONLY = (args.find((a) => a.startsWith('--only=')) ?? '').split('=')[1] || null;

function ymd(date) {
  // El endpoint del INA pide timestart/timeend como YYYY-MM-DD; alcanza con
  // fecha calendario, no hace falta hora.
  return date.toISOString().slice(0, 10);
}

/** Un decimal con coma, sin ceros de más: 5.30 -> "5,3", 5 -> "5". */
function esNumber(n) {
  return String(Number(n)).replace('.', ',');
}

/** Corre `tasks` con a lo sumo `limit` promesas en vuelo. */
async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;

  async function runOne() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runOne));
  return results;
}

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
  } finally {
    clearTimeout(timer);
  }
}

/** Observaciones de los últimos LOOKBACK_DAYS días para una serie del INA. */
async function fetchObservaciones(serie) {
  const end = new Date();
  const start = new Date(end.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const url = `${INA_BASE}/${serie}/observaciones?timestart=${ymd(start)}&timeend=${ymd(end)}`;

  const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const body = await res.json();
  // La API contesta un array plano en la mayoría de las series, pero algunas
  // vienen envueltas en { rows: [...] }. Contemplamos ambas formas.
  const rows = Array.isArray(body) ? body : Array.isArray(body?.rows) ? body.rows : null;
  if (!rows) throw new Error('respuesta sin array de observaciones');
  return rows;
}

/**
 * INA observation rows mapped into sparkline.mjs's point shape, oldest first,
 * with the unusable ones dropped. Shared by the latest-reading lookup below
 * and hubDailyDelta() further down.
 */
export function toPoints(rows) {
  return (rows ?? [])
    .map((row) => ({ level: Number(row?.valor), timestamp: row?.timestart }))
    .filter((p) => Number.isFinite(p.level) && Number.isFinite(new Date(p.timestamp).getTime()))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

const HOUR_MS = 3_600_000;
// A previous reading has to sit roughly a day before the latest one to call
// the difference a "daily" variation at all — wide enough that a station
// publishing a little early or late one day still gets compared, narrow
// enough that a three-day-old reading never passes as "yesterday".
const DAILY_MIN_SPAN_H = 18;
const DAILY_MAX_SPAN_H = 30;

/**
 * The hub's daily variation for one station: the change between its latest
 * reading and whichever other reading sits closest to 24h before THAT
 * reading's OWN timestamp — never "now". Anchoring on the reading itself
 * (rather than on sparkline.mjs's dayChange(), which anchors on "now" because
 * it exists to answer "how is the river doing right now" for a page a visitor
 * just opened) makes the result the same no matter what hour this batch job
 * happens to run at: a station that only publishes once a day must not show a
 * different delta — or none at all — depending on whether the job ran at
 * 09:00 or 21:00. Returns null when no reading in the window exists, same
 * honesty contract as dayChange().
 */
export function hubDailyDelta(points) {
  const pts = points ?? [];
  if (pts.length < 2) return null;

  const latest = pts[pts.length - 1];
  const latestAt = new Date(latest.timestamp).getTime();
  const target = latestAt - 24 * HOUR_MS;

  let ref = null;
  for (const p of pts.slice(0, -1)) {
    const at = new Date(p.timestamp).getTime();
    if (ref === null || Math.abs(at - target) < Math.abs(ref.at - target)) ref = { ...p, at };
  }
  if (!ref) return null;

  const spanH = (latestAt - ref.at) / HOUR_MS;
  if (spanH < DAILY_MIN_SPAN_H || spanH > DAILY_MAX_SPAN_H) return null;

  return Math.round((latest.level - ref.level) * 100);
}

/** The level and gauge state already baked into a locality page, or null. */
export function readBakedLevel(html) {
  const m = html.match(
    /<span id="river-now" class="st-level" data-state="([a-z-]+)">([\d.]+)<span class="unit">/,
  );
  return m ? { state: m[1], level: Number(m[2]) } : null;
}

/** The measurement date already baked into a locality page's source note, or null. */
export function readBakedDate(html) {
  const m = html.match(
    /<p id="river-src" class="stations-note">[\s\S]*?<time datetime="([0-9-]+)">([^<]*)<\/time>/,
  );
  return m ? { iso: m[1], prosa: m[2] } : null;
}

/**
 * Degrades to whatever a locality page already shows when this run could not
 * refresh it (INA down, no recent observation, unreadable file): the hub
 * keeps yesterday's honest number instead of blanking the row to "—", with no
 * delta attached since this run never confirmed one. Mirrors how refreshOne()
 * itself degrades — a failed run never erases the page's existing reading.
 */
export function fallbackReading(html) {
  if (!html) return null;
  const baked = readBakedLevel(html);
  if (!baked) return null;
  const date = readBakedDate(html);

  return {
    level: baked.level, state: baked.state, deltaCm: null,
    measuredAtIso: date?.iso ?? null, measuredAtProsa: date?.prosa ?? null,
  };
}

/** Umbrales de alerta/evacuación embebidos en el script inline de cada página. */
function readThresholds(html) {
  const m = html.match(/alertLevel:\s*([\d.]+),\s*evacuationLevel:\s*([\d.]+)/);
  if (!m) return null;
  return { alertLevel: Number(m[1]), evacuationLevel: Number(m[2]) };
}

/** Nombre de la localidad tal como ya aparece en la página (misma grafía, sin remapear). */
function readNombre(html) {
  // El <h1> no cambia con el título dinámico (que lleva el valor del día).
  const m = html.match(/<h1>Altura del río Paraná en ([^<]+?)<\/h1>/);
  return m ? m[1] : null;
}

/** Sustituye el número, el data-state y el fill de la barra, sin tocar las marcas. */
function patchGauge(html, g) {
  const label =
    `Nivel ${g.level.toFixed(2)} m. Alerta a ${g.alertLevel.toFixed(2)} m` +
    (g.evacuationLevel === null ? '' : `, evacuación a ${g.evacuationLevel.toFixed(2)} m`) + '.';

  let out = html;

  out = out.replace(
    /(<span id="river-now" class="st-level" data-state=")[a-z-]+(">)[\d.]+(<span class="unit">)/,
    `$1${g.state}$2${g.level.toFixed(2)}$3`,
  );

  out = out.replace(
    /(<div id="river-gauge"><div class="gauge" role="img" aria-label=")[^"]*(")/,
    `$1${label}$2`,
  );

  out = out.replace(
    /(<div class="gauge-fill" data-state=")[a-z-]+(" style="width:)[\d.]+(%"><\/div>)/,
    `$1${g.state}$2${g.fill.toFixed(2)}$3`,
  );

  out = out.replace(
    /(<p id="river-margin" class="river-margin">)[^<]*(<\/p>)/,
    `$1${marginLabel(g)}$2`,
  );

  return out;
}

/**
 * Agrega la fecha de la medición a la nota de fuente, sin inventar clases CSS
 * nuevas. Reconstruye el párrafo entero a partir de `nombre` en vez de
 * capturar y reusar el texto existente: si capturáramos "hasta el próximo
 * punto", una segunda corrida se comería su propio "<time>...</time>." (que
 * no tiene un punto en el medio) y lo volvería a pegar, duplicándolo. Repetir
 * la corrida sin datos nuevos tiene que dar bytes idénticos.
 */
function patchSrc(html, nombre, isoDate, fechaProsa) {
  return html.replace(
    /<p id="river-src" class="stations-note">[\s\S]*?<\/p>/,
    `<p id="river-src" class="stations-note">Medición de la Prefectura Naval Argentina en ` +
      `${nombre}, del <time datetime="${isoDate}">${fechaProsa}</time>.</p>`,
  );
}

/** <title> con el valor y el umbral de alerta al frente (ver landing/scripts/title.mjs). */
function patchTitle(html, nombre, g) {
  const title = riverTitle({ nombre, level: g.level, alertLevel: g.alertLevel });
  return html.replace(/<title>[^<]*<\/title>/, `<title>${title.replace(/&/g, '&amp;')}</title>`);
}

/** Meta description con el valor y la fecha al frente, recortando umbrales si no entra. */
function patchDescription(html, nombre, g, fechaProsa) {
  const valor = `${g.level.toFixed(2).replace('.', ',')} m`;
  const base = `Altura del río Paraná en ${nombre}: ${valor} al ${fechaProsa}, según Prefectura Naval Argentina.`;
  const umbrales = ` Alerta en ${esNumber(g.alertLevel)} m y evacuación en ${esNumber(g.evacuationLevel)} m.`;
  const full = base + umbrales;
  // 160 caracteres es el límite razonable de una meta description; si los
  // umbrales no entran, se recortan primero — nunca el valor ni la fecha.
  const description = full.length <= 160 ? full : base;

  return html.replace(
    /<meta name="description" content="[^"]*">/,
    `<meta name="description" content="${description.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">`,
  );
}

async function refreshOne(slug, info) {
  const pagePath = join(LANDING_RIO, slug, 'index.html');

  let html = null;
  try {
    html = await readFile(pagePath, 'utf8');
  } catch (err) {
    return { slug, status: 'failed', reason: `no se pudo leer ${pagePath}: ${err.message}`, reading: null };
  }

  let rows;
  try {
    rows = await fetchObservaciones(info.serie);
  } catch (err) {
    return { slug, status: 'failed', reason: `INA: ${err.message}`, reading: fallbackReading(html) };
  }

  const points = toPoints(rows);
  if (!points.length) {
    return {
      slug, status: 'no-data',
      reason: `sin observaciones en los últimos ${LOOKBACK_DAYS} días`,
      reading: fallbackReading(html),
    };
  }

  const thresholds = readThresholds(html);
  const nombre = readNombre(html);
  if (!thresholds || !nombre) {
    return {
      slug, status: 'failed', reason: 'no se pudieron leer umbrales o nombre desde el HTML',
      reading: fallbackReading(html),
    };
  }

  const latest = points[points.length - 1];
  const g = gauge({ level: latest.level, ...thresholds });
  if (!g) {
    return {
      slug, status: 'failed', reason: 'gauge() devolvió null (umbral de alerta inválido)',
      reading: fallbackReading(html),
    };
  }

  const measuredAt = new Date(latest.timestamp);
  const isoDate = isoDateAR(measuredAt);
  const fechaProsa = prosaDateAR(measuredAt);
  // Anchored on the reading's own timestamp, not on "now" — see
  // hubDailyDelta()'s own comment for why that matters for a batch job.
  const reading = {
    level: g.level, state: g.state, deltaCm: hubDailyDelta(points),
    measuredAtIso: isoDate, measuredAtProsa: fechaProsa,
  };

  let out = html;
  out = patchGauge(out, g);
  out = patchSrc(out, nombre, isoDate, fechaProsa);
  out = patchTitle(out, nombre, g);
  out = patchDescription(out, nombre, g, fechaProsa);

  if (out === html) {
    return { slug, status: 'unchanged', reason: `${g.level.toFixed(2)} m del ${isoDate}`, reading };
  }

  if (!DRY_RUN) await writeFile(pagePath, out);
  return { slug, status: 'updated', reason: `${g.level.toFixed(2)} m del ${isoDate}`, reading };
}

/** The per-station overrides indexPage() needs, from refreshOne()'s results. */
export function buildOverrides(results) {
  const overrides = new Map();
  for (const r of results) if (r.reading) overrides.set(r.slug, r.reading);
  return overrides;
}

async function main() {
  const config = JSON.parse(await readFile(ESTACIONES_PATH, 'utf8'));
  let entries = Object.entries(config.estaciones);

  if (ONLY) {
    entries = entries.filter(([slug]) => slug === ONLY);
    if (entries.length === 0) {
      console.error(`No existe "${ONLY}" en ${ESTACIONES_PATH}`);
      process.exit(1);
    }
  }

  console.log(
    `Refrescando ${entries.length} localidad(es)${DRY_RUN ? ' (dry-run, no se escribe nada)' : ''}...`,
  );

  const results = await pool(entries, MAX_CONCURRENCY, ([slug, info]) => refreshOne(slug, info));

  const byStatus = { updated: [], unchanged: [], 'no-data': [], failed: [] };
  for (const r of results) byStatus[r.status].push(r);

  console.log('');
  for (const r of byStatus.updated) console.log(`  ACTUALIZADA   ${r.slug} — ${r.reason}`);
  for (const r of byStatus.unchanged) console.log(`  SIN CAMBIOS   ${r.slug} — ${r.reason}`);
  for (const r of byStatus['no-data']) console.log(`  SIN DATO      ${r.slug} — ${r.reason}`);
  for (const r of byStatus.failed) console.log(`  FALLÓ         ${r.slug} — ${r.reason}`);

  console.log('');
  console.log(
    `Resumen: ${byStatus.updated.length} actualizadas, ${byStatus.unchanged.length} sin cambios, ` +
    `${byStatus['no-data'].length} sin dato reciente, ${byStatus.failed.length} con error ` +
    `(de ${entries.length} localidades).`,
  );

  // The hub reuses indexPage() from build-directory.mjs — the same function
  // the build uses — fed the readings this run just produced, so the hub and
  // the locality pages it links to can never show different numbers for the
  // same station. A station this run could not refresh falls back to its own
  // page's existing reading (see fallbackReading()) rather than going blank.
  const overrides = buildOverrides(results);

  let hubStatus = 'sin cambios';
  try {
    const prevHub = await readFile(HUB_PATH, 'utf8').catch(() => null);
    const nextHub = indexPage(overrides);
    if (nextHub !== prevHub) {
      if (!DRY_RUN) await writeFile(HUB_PATH, nextHub);
      hubStatus = 'actualizado';
    }
  } catch (err) {
    hubStatus = `falló (${err.message})`;
  }
  console.log(`Hub /rio/: ${hubStatus}`);

  // Una caída del INA no debe romper el workflow diario: solo se sale con
  // error si NINGUNA localidad pudo procesarse (todo falló, nada dio dato ni
  // se resolvió como "sin cambios").
  const allFailed = byStatus.failed.length === entries.length;
  process.exit(allFailed ? 1 : 0);
}

// Side effects (network, filesystem, process.exit) only run when this file is
// executed directly, never when a test imports it for the pure helpers above
// — same contract as build-directory.mjs's isEntryPoint guard.
const isEntryPoint = import.meta.url === `file://${process.argv[1]}`;
if (isEntryPoint) {
  main().catch((err) => {
    console.error('Error inesperado:', err);
    process.exit(1);
  });
}
