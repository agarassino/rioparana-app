// Pure helpers behind the locality directory. Kept free of file access so the
// page-building rules can be tested on their own.

const TIPOS = {
  'guia-pesca': { singular: 'guía de pesca', plural: 'guías de pesca', titulo: 'Guías de pesca' },
  lodge: { singular: 'lodge', plural: 'lodges', titulo: 'Lodges' },
  'escuela-kayak': { singular: 'escuela de kayak', plural: 'escuelas de kayak', titulo: 'Escuelas de kayak' },
  'escuela-paddle': { singular: 'escuela de paddle surf', plural: 'escuelas de paddle surf', titulo: 'Escuelas de paddle surf' },
  'escuela-navegacion': { singular: 'escuela de navegación', plural: 'escuelas de navegación', titulo: 'Escuelas de navegación' },
};

export function tipoLabel(tipo) {
  return TIPOS[tipo] ?? { singular: tipo, plural: tipo, titulo: tipo };
}

export function tipos() {
  return Object.keys(TIPOS);
}

// The Paraná runs roughly north to south, so latitude orders localities along
// it well enough to link neighbours without hand-maintaining a sequence.
export function riverOrder(localidades) {
  return [...localidades].sort((a, b) => b.lat - a.lat);
}

export function distanceKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function nearestStationLocality(localidad, localidades) {
  if (localidad.estacion) return localidad;

  let nearest = null;
  let best = Infinity;
  for (const candidate of localidades) {
    if (!candidate.estacion) continue;
    const d = distanceKm(localidad, candidate);
    if (d < best) {
      best = d;
      nearest = candidate;
    }
  }
  return nearest;
}

// A locality earns a page by having a gauge or at least one listed service.
// Never by merely existing: empty pages are what search engines punish.
export function publishable(localidad, servicios) {
  if (localidad.estacion) return true;
  return servicios.some((s) => s.localidad === localidad.slug);
}

function tramo(lat) {
  if (lat > -27.47) return 'Alto Paraná';
  if (lat > -32.1) return 'Paraná Medio';
  if (lat > -33.6) return 'Paraná Inferior';
  return 'Delta del Paraná';
}

function contarServicios(servicios) {
  const counts = new Map();
  for (const s of servicios) counts.set(s.tipo, (counts.get(s.tipo) ?? 0) + 1);

  return [...counts.entries()].map(([tipo, n]) => {
    const label = tipoLabel(tipo);
    return `${n} ${n === 1 ? label.singular : label.plural}`;
  });
}

function listar(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

/**
 * Builds the locality blurb out of facts that differ per place: where it sits
 * on the river, the heights at which Prefectura declares alert, how far the
 * reading travels, and what is listed there. A hand-written intro wins.
 */
export function buildIntro(localidad, estacionLocalidad, estacion, servicios) {
  if (localidad.intro) return localidad.intro;

  const frases = [`${localidad.nombre}, ${localidad.provincia}. Sobre el ${tramo(localidad.lat)}.`];

  if (estacionLocalidad && estacionLocalidad.slug === localidad.slug) {
    const alturas = [];
    if (Number.isFinite(estacion?.alertLevel)) alturas.push(`alerta en ${estacion.alertLevel.toFixed(2)} m`);
    if (Number.isFinite(estacion?.evacuationLevel)) alturas.push(`evacuación en ${estacion.evacuationLevel.toFixed(2)} m`);
    frases.push(
      alturas.length
        ? `La Prefectura mide la altura del río acá mismo, con ${listar(alturas)}.`
        : 'La Prefectura mide la altura del río acá mismo.'
    );
  } else if (estacionLocalidad) {
    const km = Math.round(distanceKm(localidad, estacionLocalidad));
    frases.push(
      `No tiene hidrómetro propio: la estación más cercana es ${estacionLocalidad.nombre}, a ${km} km.`
    );
  }

  const counts = contarServicios(servicios);
  if (counts.length) frases.push(`Hay ${listar(counts)} en el directorio.`);

  return frases.join(' ');
}

export function riverNeighbours(localidad, localidades) {
  const ordered = riverOrder(localidades);
  const i = ordered.findIndex((l) => l.slug === localidad.slug);
  return {
    upstream: i > 0 ? ordered[i - 1] : null,
    downstream: i >= 0 && i < ordered.length - 1 ? ordered[i + 1] : null,
  };
}
