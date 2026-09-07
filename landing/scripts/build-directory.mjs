#!/usr/bin/env node
// Builds the locality directory from landing/data/*.json.
//
// Everything it emits is committed to the repo: the site stays a folder of
// static files. River heights are painted client-side from /public/river, so
// the numbers stay fresh without regenerating anything.

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildIntro, nearestStationLocality, publishable, riverNeighbours,
  riverOrder, tipoLabel, tipos, distanceKm,
} from './directory.mjs';
import { gauge, gaugeHtml, marginLabel } from './gauge.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://rioparana.com.ar';
const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.syloper.rioparanaapp';

const localidades = JSON.parse(readFileSync(join(ROOT, 'data/localidades.json'), 'utf8'));
const servicios = JSON.parse(readFileSync(join(ROOT, 'data/servicios.json'), 'utf8'));

// Bake the current river level into the served HTML so crawlers (and readers
// before JS runs) see a real number instead of the "—" placeholder. The client
// still refreshes it live afterwards. Offline / API down degrades to "—".
const byStation = new Map();
try {
  const res = await fetch('https://api.rioparana.com.ar/public/river', {
    headers: { Accept: 'application/json' },
  });
  if (res.ok) {
    for (const r of await res.json()) byStation.set(r.stationId, r);
  }
} catch {
  // no-op: pages keep the placeholder and paint client-side
}

const fmtM = (v) => `${Number(v)} m`;

// Same content hash the home page gets, so a style fix reaches every page
// instead of waiting behind a cached stylesheet.
function stamp(file) {
  const bytes = readFileSync(join(ROOT, file));
  return `${file}?v=${createHash('sha256').update(bytes).digest('hex').slice(0, 8)}`;
}
const CSS = { tokens: stamp('/tokens.css'), site: stamp('/site.css'), analytics: stamp('/analytics.js') };

// The chart maths reaches the browser as the very file the tests import, with
// the export keywords stripped. Inlining beats serving it separately: it is
// under 3 kB, it paints without a second round trip, and a new /sparkline.js
// would need its own COPY line in the Dockerfile — which is exactly how the
// /rio/* pages once shipped as 404s.
const inlineModule = (file) =>
  readFileSync(join(ROOT, file), 'utf8').replace(/^export /gm, '');

const SPARKLINE_SRC = inlineModule('scripts/sparkline.mjs');
const SHARE_SRC = inlineModule('scripts/share.mjs');
const GAUGE_SRC = inlineModule('scripts/gauge.mjs');
const APPBAR_SRC = inlineModule('scripts/appbar.mjs');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const published = riverOrder(localidades.filter((l) => publishable(l, servicios)));

// Alert and evacuation heights are stable reference values, so they are baked
// into the page rather than fetched. That keeps the unique part of the text
// visible to a crawler that never runs the script.
function refHeights(estacionLocalidad) {
  if (!estacionLocalidad) return {};
  return {
    nombre: estacionLocalidad.nombre,
    alertLevel: estacionLocalidad.alerta,
    evacuationLevel: estacionLocalidad.evacuacion,
  };
}

// The reading, baked so a crawler and a reader without JavaScript both see a
// real number. The distance to alert used to be glued onto the same line; it
// now lives under the bar, where it does not compete with the figure itself.
function bakedReading(estacionLocalidad) {
  if (!estacionLocalidad) return { level: null, gauge: null };
  const r = byStation.get(estacionLocalidad.estacion);
  if (!r || !Number.isFinite(Number(r.level))) return { level: null, gauge: null };

  return {
    level: `${Number(r.level).toFixed(2)} m`,
    // Alert and evacuation come from the locality data, which is stable and
    // committed, rather than from whatever the API happened to answer.
    gauge: gauge({
      level: Number(r.level),
      alertLevel: estacionLocalidad.alerta,
      evacuationLevel: estacionLocalidad.evacuacion,
    }),
  };
}

const byLocality = new Map();
for (const s of servicios) {
  if (!byLocality.has(s.localidad)) byLocality.set(s.localidad, []);
  byLocality.get(s.localidad).push(s);
}

function head({ title, description, canonical, jsonld }) {
  return `<!doctype html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<link rel="stylesheet" href="${CSS.tokens}">
<link rel="stylesheet" href="${CSS.site}">
<script defer src="${CSS.analytics}"></script>
${jsonld.map((b) => `<script type="application/ld+json">${JSON.stringify(b)}</script>`).join('\n')}
</head>
<body>
<header class="masthead"><div class="masthead-inner wrap">
  <a class="wordmark" href="/">Paraná Info</a>
</div></header>`;
}

const FOOT = `
<footer class="wrap" style="padding:2rem 0">
  <p><a href="/">Volver a Paraná Info</a></p>
  <p class="disclaimer">Alturas: información pública de la Prefectura Naval Argentina.
  Paraná Info es una aplicación independiente y no está afiliada a ningún organismo público.
  Los servicios listados enlazan a su contacto público; no republicamos sus datos.</p>
</footer>
</body>
</html>`;

// Painted on the client so a regenerated page is not needed for fresh numbers.
// The bar is rebuilt from the same gauge.mjs the build used, so the served
// markup and the repainted markup cannot drift apart.
function riverScript(estacionId, estacionLocalidad) {
  if (!estacionId) return '';
  const alerta = Number.isFinite(Number(estacionLocalidad?.alerta))
    ? Number(estacionLocalidad.alerta) : 'null';
  const evac = Number.isFinite(Number(estacionLocalidad?.evacuacion))
    ? Number(estacionLocalidad.evacuacion) : 'null';

  return `
<script>
(function(){
  var el = document.getElementById('river-now');
  if (!el) return;
${GAUGE_SRC}
  fetch('https://api.rioparana.com.ar/public/river', { headers: { Accept: 'application/json' } })
    .then(function(r){ if(!r.ok) throw 0; return r.json(); })
    .then(function(rows){
      var r = rows.filter(function(x){ return x.stationId === ${JSON.stringify(estacionId)}; })[0];
      if (!r) return;

      var g = gauge({ level: r.level, alertLevel: ${alerta}, evacuationLevel: ${evac} });
      // The figure carries the unit in its own span so the number stays the
      // loudest thing on the page.
      el.innerHTML = r.level.toFixed(2) + '<span class="unit"> m</span>';
      el.setAttribute('data-state', g ? g.state : 'live');

      var bar = document.getElementById('river-gauge');
      if (bar && g) bar.innerHTML = gaugeHtml(g);

      var margin = document.getElementById('river-margin');
      if (margin && g) {
        margin.textContent = marginLabel(g);
        margin.hidden = false;
      }

      var src = document.getElementById('river-src');
      if (src) src.hidden = false;
    })
    .catch(function(){});
})();
</script>`;
}

// The trend is drawn on the client and nowhere else. Baking it would freeze a
// seven-day window at the moment of the last deploy, and a chart headed "los
// últimos días" showing three-week-old dates is worse than no chart. The
// section ships hidden and reveals itself only once there are two readings to
// join, so a station with no history yet looks exactly as it does today.
function trendScript(estacionId, alertLevel) {
  if (!estacionId) return '';
  const alert = Number.isFinite(Number(alertLevel)) ? Number(alertLevel) : 'null';

  return `
<script>
(function(){
  var sec = document.getElementById('river-trend');
  if (!sec || !window.fetch) return;
${SPARKLINE_SRC}
  var fmtDay = function(iso){
    try { return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }); }
    catch (e) { return ''; }
  };

  fetch('https://api.rioparana.com.ar/public/river/' + ${JSON.stringify(estacionId)} + '/history',
        { headers: { Accept: 'application/json' } })
    .then(function(r){ if (!r.ok) throw 0; return r.json(); })
    .then(function(rows){
      var now = new Date();
      var points = lastDays(rows, CHART_DAYS, now);
      var line = sparkline(points, { width: 640, height: 150, padding: 12, alertLevel: ${alert} });
      // One reading is not a trend. Say nothing rather than draw a dot and
      // call it a week.
      if (!line) return;

      var badge = dayBadge(dayChange(points, now));
      if (badge) {
        var day = sec.querySelector('.trend-day');
        day.setAttribute('data-dir', badge.dir);
        sec.querySelector('.trend-day-text').textContent = badge.text;
        sec.querySelector('.trend-day-detail').textContent = badge.detail;
        day.hidden = false;
      }

      sec.querySelector('.trend-summary').textContent = trendSummary(line);
      sec.querySelector('.trend-chart').innerHTML = chartSvg(line);
      sec.querySelector('.trend-scale').textContent = scaleLabel(line);
      sec.querySelector('.trend-range').textContent = rangeLabel(line, fmtDay);
      sec.hidden = false;
    })
    .catch(function(){});
})();
</script>`;
}

// The last day comes first: "what did it do since yesterday" is the question
// people actually arrive with. The week is context for that answer, not the
// answer itself. The badge hides on its own when the readings cannot say.
const TREND_SECTION = `
  <section class="river-trend" id="river-trend" hidden>
    <h2>Cómo viene el río</h2>
    <p class="trend-day" hidden>
      <span class="trend-arrow" aria-hidden="true"></span>
      <span class="trend-day-text"></span>
      <span class="trend-day-detail"></span>
    </p>
    <p class="trend-summary"></p>
    <div class="trend-chart"></div>
    <p class="trend-scale"></p>
    <p class="stations-note trend-range"></p>
  </section>`;

// Forwarding a reading to a WhatsApp group is how this page travels between
// people who fish together. The button ships hidden and appears only where the
// browser can actually share or copy: a button that does nothing is worse than
// no button.
function shareScript(nombre) {
  return `
<script>
(function(){
  var btn = document.getElementById('share-river');
  var wa = document.getElementById('share-wa');
  if (!btn || !wa) return;
  var canShare = typeof navigator.share === 'function';
  var canCopy = !!(navigator.clipboard && navigator.clipboard.writeText);
${SHARE_SRC}
  var label = btn.querySelector('.share-label');
  var idle = label.textContent;

  function said(word){
    label.textContent = word;
    setTimeout(function(){ label.textContent = idle; }, 2000);
  }

  function track(method){
    if (typeof posthog !== 'undefined') {
      posthog.capture('share_click', { method: method, page: location.pathname });
    }
  }

  function current(){
    var lvl = document.getElementById('river-now');
    var margin = document.getElementById('river-margin');
    var state = lvl ? lvl.getAttribute('data-state') : null;
    // The distance to alert travels only when the page is actually flagging
    // the river as close to it; the rest of the time it is noise.
    var near = state === 'near-alert' || state === 'alert' || state === 'evacuation';

    var day = document.querySelector('.trend-day');
    var dayText = day && !day.hidden
      ? day.querySelector('.trend-day-text').textContent + ' ' +
        day.querySelector('.trend-day-detail').textContent
      : '';

    var canonical = document.querySelector('link[rel="canonical"]');
    return sharePayload({
      locality: ${JSON.stringify(nombre)},
      url: canonical ? canonical.href : location.href.split('?')[0],
      level: lvl ? lvl.textContent : '',
      alert: near && margin ? margin.textContent : null,
      day: dayText
    });
  }

  // WhatsApp is where this actually gets forwarded here, so it gets its own
  // button rather than hiding one tap deeper inside the share sheet.
  wa.hidden = false;
  wa.addEventListener('click', function(){
    track('whatsapp');
    window.open(whatsappUrl(current()), '_blank', 'noopener');
  });

  if (!canShare && !canCopy) return;
  btn.hidden = false;
  btn.addEventListener('click', function(){
    var payload = current();
    if (canShare) {
      // A cancelled share is not a share: let it reject quietly rather than
      // counting it or showing the copy confirmation.
      navigator.share(payload).then(function(){ track('native'); }, function(){});
      return;
    }
    navigator.clipboard.writeText(clipboardText(payload)).then(function(){
      said('Copiado');
      track('clipboard');
    }, function(){ said('No se pudo copiar'); });
  });
})();
</script>`;
}

// One mark per service type. Inline SVG rather than a sprite or a font: five
// small paths cost less than another request, and they inherit the text
// colour so they follow the theme without a second definition.
const TIPO_ICON = {
  'guia-pesca': '<path d="M3 17c4-6 9-9 15-9"/><path d="M14 4l4 4-3 3"/><path d="M7 21c2-2 3-4 3-6"/>',
  lodge: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  'escuela-kayak': '<path d="M2 8l20 8"/><path d="M5 16c4.5 2.5 9.5 2.5 14 0"/><path d="M4 12h16"/>',
  'escuela-paddle': '<path d="M12 2v14"/><path d="M12 16c-3 0-5 2-5 5h10c0-3-2-5-5-5z"/><path d="M8 5l4-3 4 3"/>',
  'escuela-navegacion': '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5.5-5.5 2 2-5.5z"/>',
};

function tipoIcon(tipo) {
  const paths = TIPO_ICON[tipo];
  if (!paths) return '';
  return `<svg class="svc-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

// These pages carry the organic traffic and had no link to the listing at all:
// a reader arriving from a search could read the height and had no way to
// install. A slim sticky bar is what Google's guidance permits; a covering
// interstitial is what it penalises, so this is deliberately not a popup.
// Both numbers are checked against what actually ships: 38 stations served by
// /public/river, 997 features in parana-map.geojson.
const APP_BAR = `
<aside class="app-bar" id="app-bar" hidden>
  <img class="app-bar-icon" src="${stamp('/img/app-icon.png')}" alt="" width="44" height="44">
  <span class="app-bar-copy">
    <b>Paraná Info</b>
    <span>38 estaciones y casi 1.000 puntos de pesca, en el teléfono</span>
  </span>
  <a class="btn btn-primary app-bar-cta" data-cta="install" data-cta-location="app_bar"
     href="${PLAY_URL}" target="_blank" rel="noopener">Instalar</a>
  <button type="button" class="app-bar-close" id="app-bar-close" aria-label="Cerrar aviso">
    <span aria-hidden="true">\u00d7</span>
  </button>
</aside>`;

function appBarScript() {
  return `
<script>
(function(){
  var bar = document.getElementById('app-bar');
  if (!bar) return;
${APPBAR_SRC}
  var store = null;
  try { store = window.localStorage; } catch (e) { store = null; }
  if (isDismissed(store)) return;

  var shown = false;
  function measure(){
    return {
      scrollY: window.pageYOffset || document.documentElement.scrollTop || 0,
      viewportH: window.innerHeight || 0,
      docH: document.documentElement.scrollHeight || 0
    };
  }

  function reveal(){
    if (shown || !shouldReveal(measure())) return;
    shown = true;
    bar.hidden = false;
    window.removeEventListener('scroll', reveal);
    if (typeof posthog !== 'undefined') {
      posthog.capture('app_bar_shown', { page: location.pathname });
    }
  }

  document.getElementById('app-bar-close').addEventListener('click', function(){
    bar.hidden = true;
    rememberDismissal(store);
    if (typeof posthog !== 'undefined') {
      posthog.capture('app_bar_dismiss', { page: location.pathname });
    }
  });

  window.addEventListener('scroll', reveal, { passive: true });
  // A page that fits the viewport fires no scroll event, so decide once now.
  reveal();
})();
</script>`;
}

const SHARE_BUTTONS = `
    <p class="river-actions">
      <button type="button" class="btn btn-primary share-wa" id="share-wa" hidden>
        <span class="wa-icon" aria-hidden="true"></span>
        <span>Enviar por WhatsApp</span>
      </button>
      <button type="button" class="btn btn-ghost share-btn" id="share-river" hidden>
        <span class="share-icon" aria-hidden="true"></span>
        <span class="share-label" aria-live="polite">Compartir</span>
      </button>
    </p>`;

function localityPage(loc) {
  const estLoc = nearestStationLocality(loc, localidades);
  const prestada = estLoc && estLoc.slug !== loc.slug;
  const mine = byLocality.get(loc.slug) ?? [];
  const { upstream, downstream } = riverNeighbours(loc, published);

  const title = `Altura del río Paraná en ${loc.nombre} hoy — Prefectura Naval | Paraná Info`;
  const lectura = bakedReading(estLoc);
  const description =
    `Altura del río Paraná en ${loc.nombre} hoy, según Prefectura Naval Argentina.` +
    (estLoc
      ? ` Nivel en tiempo real, alerta en ${fmtM(estLoc.alerta)} y evacuación en ${fmtM(estLoc.evacuacion)}.`
      : '') +
    (mine.length
      ? ` ${mine.length === 1 ? 'Un servicio náutico y de pesca' : mine.length + ' servicios náuticos y de pesca'} en la zona.`
      : '');

  const jsonld = [
    { '@context': 'https://schema.org', '@type': 'Place', name: loc.nombre,
      address: { '@type': 'PostalAddress', addressLocality: loc.nombre, addressRegion: loc.provincia, addressCountry: 'AR' },
      geo: { '@type': 'GeoCoordinates', latitude: loc.lat, longitude: loc.lon } },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Paraná Info', item: SITE },
      { '@type': 'ListItem', position: 2, name: 'Localidades', item: `${SITE}/rio/` },
      { '@type': 'ListItem', position: 3, name: loc.nombre, item: `${SITE}/rio/${loc.slug}/` },
    ] },
    ...mine.map((s) => ({ '@context': 'https://schema.org', '@type': 'LocalBusiness',
      name: s.nombre, url: s.contacto,
      address: { '@type': 'PostalAddress', addressLocality: loc.nombre, addressRegion: loc.provincia, addressCountry: 'AR' } })),
  ];

  const grouped = tipos()
    .map((t) => [t, mine.filter((s) => s.tipo === t)])
    .filter(([, list]) => list.length);

  return head({ title, description, canonical: `${SITE}/rio/${loc.slug}/`, jsonld }) + `
<main class="wrap" style="padding-top:2rem">
  <nav class="crumbs"><a href="/">Inicio</a> › <a href="/rio/">Localidades</a> › ${esc(loc.nombre)}</nav>

  <h1>Altura del río Paraná en ${esc(loc.nombre)}</h1>

  <section class="river-now">
    <h2>El río hoy</h2>
    <p class="river-figure"><span id="river-now" class="st-level"${
      lectura.gauge ? ` data-state="${lectura.gauge.state}"` : ''
    }>${lectura.level ? `${esc(lectura.level.replace(' m', ''))}<span class="unit"> m</span>` : '—'}</span></p>
    <div id="river-gauge">${gaugeHtml(lectura.gauge)}</div>
    <p id="river-margin" class="river-margin"${lectura.gauge ? '' : ' hidden'}>${
      esc(marginLabel(lectura.gauge))
    }</p>
    <p id="river-src" class="stations-note"${lectura.level ? '' : ' hidden'}>${
      prestada
        ? `Lectura de la estación ${esc(estLoc.nombre)}, a ${Math.round(distanceKm(loc, estLoc))} km. ${esc(loc.nombre)} no tiene hidrómetro propio.`
        : `Medición de la Prefectura Naval Argentina en ${esc(loc.nombre)}.`
    }</p>${SHARE_BUTTONS}
  </section>
${TREND_SECTION}

  <section class="intro">
    <p class="lede">${esc(buildIntro(loc, estLoc, refHeights(estLoc), mine))}</p>
  </section>
${grouped.map(([t, list]) => `
  <section class="svc-group">
    <h2 class="svc-head">${tipoIcon(t)}<span>${esc(tipoLabel(t).titulo)} en ${esc(loc.nombre)}</span></h2>
    <ul class="svc-list">${list.map((sv) => `<li><a href="${esc(sv.ficha ?? sv.contacto)}"${sv.ficha ? '' : ' rel="nofollow noopener" target="_blank"'}>${esc(sv.nombre)}</a></li>`).join('')}</ul>
  </section>`).join('')}

  <nav class="river-nav">
    ${upstream ? `<a href="/rio/${upstream.slug}/">← Río arriba: ${esc(upstream.nombre)}</a>` : '<span></span>'}
    ${downstream ? `<a href="/rio/${downstream.slug}/">Río abajo: ${esc(downstream.nombre)} →</a>` : '<span></span>'}
  </nav>
</main>
${riverScript(estLoc ? estLoc.estacion : null, estLoc)}
${trendScript(estLoc ? estLoc.estacion : null, estLoc ? estLoc.alerta : null)}
${APP_BAR}
${shareScript(loc.nombre)}
${appBarScript()}
${FOOT}`;
}

function indexPage() {
  const jsonld = [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Paraná Info', item: SITE },
    { '@type': 'ListItem', position: 2, name: 'Localidades', item: `${SITE}/rio/` },
  ] }];

  return head({
    title: 'Localidades del río Paraná — altura y servicios | Paraná Info',
    description: `Altura del río Paraná y servicios náuticos y de pesca en ${published.length} localidades, del Alto Paraná al Delta.`,
    canonical: `${SITE}/rio/`, jsonld,
  }) + `
<main class="wrap" style="padding-top:2rem">
  <nav class="crumbs"><a href="/">Inicio</a> › Localidades</nav>
  <h1>Localidades del río Paraná</h1>
  <p class="lede">Del Alto Paraná al Delta. Cada localidad muestra la altura del río y los servicios listados.</p>
  <ul class="stations-grid">${published.map((l) => {
    const n = (byLocality.get(l.slug) ?? []).length;
    return `<li><a href="/rio/${l.slug}/">${esc(l.nombre)}</a> <span class="muted">${esc(l.provincia)}${n ? ` · ${n}` : ''}</span></li>`;
  }).join('')}</ul>
</main>
${FOOT}`;
}

function typePage(tipo) {
  const list = servicios.filter((s) => s.tipo === tipo);
  if (!list.length) return null;

  const label = tipoLabel(tipo);
  const jsonld = [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Paraná Info', item: SITE },
    { '@type': 'ListItem', position: 2, name: label.titulo, item: `${SITE}/servicios/${tipo}/` },
  ] }];

  return head({
    title: `${label.titulo} en el río Paraná | Paraná Info`,
    description: `${label.titulo} sobre el río Paraná, por localidad.`,
    canonical: `${SITE}/servicios/${tipo}/`, jsonld,
  }) + `
<main class="wrap" style="padding-top:2rem">
  <nav class="crumbs"><a href="/">Inicio</a> › ${esc(label.titulo)}</nav>
  <h1>${esc(label.titulo)} en el río Paraná</h1>
  <ul class="svc-list">${list.map((s) => {
    const loc = localidades.find((l) => l.slug === s.localidad);
    return `<li><a href="${esc(s.ficha ?? s.contacto)}"${s.ficha ? '' : ' rel="nofollow noopener" target="_blank"'}>${esc(s.nombre)}</a>` +
      (loc ? ` <span class="muted">— <a href="/rio/${loc.slug}/">${esc(loc.nombre)}</a></span>` : '') + '</li>';
  }).join('')}</ul>
</main>
${FOOT}`;
}

function write(path, html) {
  const full = join(ROOT, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, html);
}

// Regenerate from scratch so a locality removed from the data disappears.
for (const dir of ['rio', 'servicios']) {
  if (existsSync(join(ROOT, dir))) rmSync(join(ROOT, dir), { recursive: true });
}

const urls = [`${SITE}/`, `${SITE}/rio/`];
write('rio/index.html', indexPage());

for (const loc of published) {
  write(`rio/${loc.slug}/index.html`, localityPage(loc));
  urls.push(`${SITE}/rio/${loc.slug}/`);
}

for (const t of tipos()) {
  const html = typePage(t);
  if (!html) continue;
  write(`servicios/${t}/index.html`, html);
  urls.push(`${SITE}/servicios/${t}/`);
}

for (const g of ['fansfishing', 'careca-pesca', 'la-paz']) urls.push(`${SITE}/guias/${g}.html`);

writeFileSync(join(ROOT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n') +
  `\n</urlset>\n`);

// The home page is hand-maintained, but its station list has to stay in step
// with the directory: those are the links that let a crawler reach every
// locality page from the one page it already knows.
const homePath = join(ROOT, 'index.html');
let home = readFileSync(homePath, 'utf8');

// Stamp each screenshot URL with a hash of its bytes. Replacing an image
// without changing its URL leaves returning visitors on the old one for as
// long as the cache lasts, which is how the stretched mockups survived a
// deploy that had already fixed them.
// Stylesheets need the same treatment: a CSS fix nobody sees because the old
// file is still cached is indistinguishable from a fix that did not work.
home = home.replace(/(\/(?:site|tokens)\.css|\/analytics\.js)(\?v=[a-f0-9]+)?/g, (_m, file) => {
  const bytes = readFileSync(join(ROOT, file));
  return `${file}?v=${createHash('sha256').update(bytes).digest('hex').slice(0, 8)}`;
});

home = home.replace(/(\/img\/[a-z0-9-]+\.(?:png|webp))(\?v=[a-f0-9]+)?/g, (_m, file) => {
  const bytes = readFileSync(join(ROOT, file));
  return `${file}?v=${createHash('sha256').update(bytes).digest('hex').slice(0, 8)}`;
});
const items = published
  .filter((l) => l.estacion)
  .map((l) =>
    `<li data-station="${l.estacion}"><a class="st-name" href="/rio/${l.slug}/">${esc(l.nombre)}</a>` +
    `<span class="st-level" data-fallback="—">—</span></li>`)
  .join('');
const listPattern = /<ul id="station-list">[\s\S]*?<\/ul>/;
if (!listPattern.test(home)) {
  // Comparing the result would report a false miss whenever the list is
  // already up to date, which is the common case.
  console.warn('AVISO: no se encontró #station-list en index.html');
} else {
  writeFileSync(homePath, home.replace(listPattern, `<ul id="station-list">${items}</ul>`));
}

console.log(`${published.length} localidades, ${servicios.length} servicios, ${urls.length} URLs en el sitemap`);
