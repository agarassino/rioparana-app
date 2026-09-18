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
// puntos que dependen del nivel del río (número, barra, margen, fuente+fecha,
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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LANDING_RIO = join(ROOT, 'landing/rio');
const ESTACIONES_PATH = join(ROOT, 'scripts/ina-estaciones.json');

const INA_BASE = 'https://alerta.ina.gob.ar/a5/obs/puntual/series';
const LOOKBACK_DAYS = 7;
const MAX_CONCURRENCY = 6;
const FETCH_TIMEOUT_MS = 15_000;
const TZ = 'America/Argentina/Buenos_Aires';

const isoDateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});
const prosaDateFmt = new Intl.DateTimeFormat('es-AR', {
  timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric',
});

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

/** La observación más reciente por timestart, o null si no hay ninguna. */
function latestObservation(rows) {
  let best = null;
  for (const row of rows) {
    const valor = Number(row?.valor);
    const at = new Date(row?.timestart ?? NaN).getTime();
    if (!Number.isFinite(valor) || !Number.isFinite(at)) continue;
    if (!best || at > best.at) best = { valor, at };
  }
  return best;
}

/** Umbrales de alerta/evacuación embebidos en el script inline de cada página. */
function readThresholds(html) {
  const m = html.match(/alertLevel:\s*([\d.]+),\s*evacuationLevel:\s*([\d.]+)/);
  if (!m) return null;
  return { alertLevel: Number(m[1]), evacuationLevel: Number(m[2]) };
}

/** Nombre de la localidad tal como ya aparece en la página (misma grafía, sin remapear). */
function readNombre(html) {
  const m = html.match(/<title>Altura del río Paraná en ([^<]+?) hoy/);
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

  let rows;
  try {
    rows = await fetchObservaciones(info.serie);
  } catch (err) {
    return { slug, status: 'failed', reason: `INA: ${err.message}` };
  }

  const latest = latestObservation(rows);
  if (!latest) {
    return { slug, status: 'no-data', reason: `sin observaciones en los últimos ${LOOKBACK_DAYS} días` };
  }

  let html;
  try {
    html = await readFile(pagePath, 'utf8');
  } catch (err) {
    return { slug, status: 'failed', reason: `no se pudo leer ${pagePath}: ${err.message}` };
  }

  const thresholds = readThresholds(html);
  const nombre = readNombre(html);
  if (!thresholds || !nombre) {
    return { slug, status: 'failed', reason: 'no se pudieron leer umbrales o nombre desde el HTML' };
  }

  const g = gauge({ level: latest.valor, ...thresholds });
  if (!g) {
    return { slug, status: 'failed', reason: 'gauge() devolvió null (umbral de alerta inválido)' };
  }

  const isoDate = isoDateFmt.format(new Date(latest.at));
  const fechaProsa = prosaDateFmt.format(new Date(latest.at));

  let out = html;
  out = patchGauge(out, g);
  out = patchSrc(out, nombre, isoDate, fechaProsa);
  out = patchDescription(out, nombre, g, fechaProsa);

  if (out === html) {
    return { slug, status: 'unchanged', reason: `${g.level.toFixed(2)} m del ${isoDate}` };
  }

  if (!DRY_RUN) await writeFile(pagePath, out);
  return { slug, status: 'updated', reason: `${g.level.toFixed(2)} m del ${isoDate}` };
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

  // Una caída del INA no debe romper el workflow diario: solo se sale con
  // error si NINGUNA localidad pudo procesarse (todo falló, nada dio dato ni
  // se resolvió como "sin cambios").
  const allFailed = byStatus.failed.length === entries.length;
  process.exit(allFailed ? 1 : 0);
}

main().catch((err) => {
  console.error('Error inesperado:', err);
  process.exit(1);
});
