import { describe, expect, test } from 'vitest';
import {
  buildIntro,
  distanceKm,
  nearestStationLocality,
  publishable,
  riverNeighbours,
} from '../landing/scripts/directory.mjs';

const goya = { slug: 'goya', nombre: 'Goya', provincia: 'Corrientes', lat: -29.1333, lon: -59.2667, estacion: 'goya' };
const rosario = { slug: 'rosario', nombre: 'Rosario', provincia: 'Santa Fe', lat: -32.95, lon: -60.65, estacion: 'rosario' };
const sanPedro = { slug: 'san-pedro', nombre: 'San Pedro', provincia: 'Buenos Aires', lat: -33.6833, lon: -59.6667, estacion: 'san-pedro' };
// Sin hidrómetro propio: entra al directorio por tener un servicio.
const baradero = { slug: 'baradero', nombre: 'Baradero', provincia: 'Buenos Aires', lat: -33.8, lon: -59.5 };
const vacia = { slug: 'vacia', nombre: 'Vacía', provincia: 'Santa Fe', lat: -31, lon: -60 };

const ALL = [goya, rosario, sanPedro, baradero, vacia];

describe('distanceKm', () => {
  test('returns zero for the same point', () => {
    expect(distanceKm(goya, goya)).toBeCloseTo(0, 5);
  });

  test('measures a known separation within a kilometre', () => {
    // Rosario a San Pedro, ~122 km en línea recta.
    expect(distanceKm(rosario, sanPedro)).toBeGreaterThan(115);
    expect(distanceKm(rosario, sanPedro)).toBeLessThan(130);
  });
});

describe('nearestStationLocality', () => {
  test('returns the locality itself when it has a gauge', () => {
    expect(nearestStationLocality(rosario, ALL)?.slug).toBe('rosario');
  });

  test('finds the closest gauge for a locality without one', () => {
    expect(nearestStationLocality(baradero, ALL)?.slug).toBe('san-pedro');
  });

  test('returns null when no locality has a gauge', () => {
    expect(nearestStationLocality(baradero, [baradero, vacia])).toBeNull();
  });
});

describe('publishable', () => {
  test('publishes a locality that has a gauge', () => {
    expect(publishable(goya, [])).toBe(true);
  });

  test('publishes a locality that only has a service', () => {
    expect(publishable(baradero, [{ localidad: 'baradero' }])).toBe(true);
  });

  test('skips a locality with neither', () => {
    expect(publishable(vacia, [{ localidad: 'goya' }])).toBe(false);
  });
});

describe('buildIntro', () => {
  const station = { nombre: 'Goya', alertLevel: 5.2, evacuationLevel: 5.7 };

  test('names the province and the river section', () => {
    const intro = buildIntro(goya, goya, station, []);
    expect(intro).toContain('Corrientes');
    expect(intro).toContain('Paraná Medio');
  });

  test('states the alert height when the locality has its own gauge', () => {
    const intro = buildIntro(goya, goya, station, []);
    expect(intro).toContain('5.20');
    expect(intro).toMatch(/mide la altura del río acá/i);
  });

  test('says where a borrowed reading comes from and how far', () => {
    const intro = buildIntro(baradero, sanPedro, { nombre: 'San Pedro' }, []);
    expect(intro).toContain('San Pedro');
    expect(intro).toMatch(/\d+ km/);
  });

  test('counts the listed services by type', () => {
    const intro = buildIntro(goya, goya, station, [
      { tipo: 'guia-pesca' }, { tipo: 'guia-pesca' }, { tipo: 'lodge' },
    ]);
    expect(intro).toContain('2 guías de pesca');
    expect(intro).toContain('1 lodge');
  });

  test('differs between localities, which is the point of generating it', () => {
    const a = buildIntro(goya, goya, station, []);
    const b = buildIntro(rosario, rosario, { nombre: 'Rosario', alertLevel: 5 }, []);
    expect(a).not.toBe(b);
  });

  test('prefers a hand-written intro when one exists', () => {
    const written = { ...goya, intro: 'Goya es la capital del surubí.' };
    expect(buildIntro(written, goya, station, [])).toBe('Goya es la capital del surubí.');
  });
});

describe('riverNeighbours', () => {
  test('orders neighbours upstream and downstream', () => {
    const { upstream, downstream } = riverNeighbours(rosario, [goya, rosario, sanPedro, baradero]);
    expect(upstream?.slug).toBe('goya');
    expect(downstream?.slug).toBe('san-pedro');
  });

  test('leaves the first locality without an upstream neighbour', () => {
    expect(riverNeighbours(goya, [goya, rosario]).upstream).toBeNull();
  });

  test('leaves the last locality without a downstream neighbour', () => {
    expect(riverNeighbours(baradero, [rosario, baradero]).downstream).toBeNull();
  });
});
