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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://rioparana.com.ar';

const localidades = JSON.parse(readFileSync(join(ROOT, 'data/localidades.json'), 'utf8'));
const servicios = JSON.parse(readFileSync(join(ROOT, 'data/servicios.json'), 'utf8'));

// Same content hash the home page gets, so a style fix reaches every page
// instead of waiting behind a cached stylesheet.
function stamp(file) {
  const bytes = readFileSync(join(ROOT, file));
  return `${file}?v=${createHash('sha256').update(bytes).digest('hex').slice(0, 8)}`;
}
const CSS = { tokens: stamp('/tokens.css'), site: stamp('/site.css') };

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
<script defer src="/analytics.js"></script>
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
function riverScript(estacionId, prestada) {
  return `
<script>
(function(){
  var el = document.getElementById('river-now');
  if (!el) return;
  fetch('https://api.rioparana.com.ar/public/river', { headers: { Accept: 'application/json' } })
    .then(function(r){ if(!r.ok) throw 0; return r.json(); })
    .then(function(rows){
      var r = rows.filter(function(x){ return x.stationId === ${JSON.stringify(estacionId)}; })[0];
      if (!r) return;
      var txt = r.level.toFixed(2) + ' m';
      if (typeof r.alertLevel === 'number') {
        var d = r.alertLevel - r.level;
        txt += d >= 0
          ? ' · a ' + d.toFixed(2) + ' m del nivel de alerta'
          : ' · supera el nivel de alerta';
      }
      el.textContent = txt;
      el.setAttribute('data-state', typeof r.alertLevel === 'number' && r.alertLevel - r.level <= 1 ? 'near-alert' : 'live');
      var src = document.getElementById('river-src');
      if (src) src.hidden = false;
    })
    .catch(function(){});
})();
</script>`;
}

function localityPage(loc) {
  const estLoc = nearestStationLocality(loc, localidades);
  const prestada = estLoc && estLoc.slug !== loc.slug;
  const mine = byLocality.get(loc.slug) ?? [];
  const { upstream, downstream } = riverNeighbours(loc, published);

  const title = `${loc.nombre}, ${loc.provincia} — río Paraná, altura y servicios | Paraná Info`;
  const description =
    `Altura del río Paraná en ${loc.nombre}, ${loc.provincia}` +
    (mine.length ? `, y ${mine.length === 1 ? 'un servicio' : mine.length + ' servicios'} náuticos y de pesca.` : '.');

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

  <h1>${esc(loc.nombre)}, ${esc(loc.provincia)}</h1>

  <section class="river-now">
    <h2>El río hoy</h2>
    <p class="river-figure"><span id="river-now" class="st-level">—</span></p>
    <p id="river-src" class="stations-note" hidden>${
      prestada
        ? `Lectura de la estación ${esc(estLoc.nombre)}, a ${Math.round(distanceKm(loc, estLoc))} km. ${esc(loc.nombre)} no tiene hidrómetro propio.`
        : `Medición de la Prefectura Naval Argentina en ${esc(loc.nombre)}.`
    }</p>
  </section>

  <section>
    <p class="lede">${esc(buildIntro(loc, estLoc, refHeights(estLoc), mine))}</p>
  </section>
${grouped.map(([t, list]) => `
  <section>
    <h2>${esc(tipoLabel(t).titulo)} en ${esc(loc.nombre)}</h2>
    <ul class="svc-list">${list.map((s) => `<li><a href="${esc(s.ficha ?? s.contacto)}"${s.ficha ? '' : ' rel="nofollow noopener" target="_blank"'}>${esc(s.nombre)}</a></li>`).join('')}</ul>
  </section>`).join('')}

  <nav class="river-nav">
    ${upstream ? `<a href="/rio/${upstream.slug}/">← Río arriba: ${esc(upstream.nombre)}</a>` : '<span></span>'}
    ${downstream ? `<a href="/rio/${downstream.slug}/">Río abajo: ${esc(downstream.nombre)} →</a>` : '<span></span>'}
  </nav>
</main>
${riverScript(estLoc ? estLoc.estacion : null, prestada)}
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
home = home.replace(/(\/(?:site|tokens)\.css)(\?v=[a-f0-9]+)?/g, (_m, file) => {
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
