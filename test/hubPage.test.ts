import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { indexPage } from '../landing/scripts/build-directory.mjs';
import { HUB_FAQ } from '../landing/scripts/hub.mjs';

interface Locality { slug: string; estacion?: string }

const localidades: Locality[] = JSON.parse(
  readFileSync(join(process.cwd(), 'landing/data/localidades.json'), 'utf8')
);
const servicios: Array<{ localidad: string }> = JSON.parse(
  readFileSync(join(process.cwd(), 'landing/data/servicios.json'), 'utf8')
);
const PUBLISHED_COUNT = localidades.filter(
  (l) => l.estacion || servicios.some((s) => s.localidad === l.slug)
).length;
const STATION_COUNT = localidades.filter((l) => l.estacion).length;

function overrideFor(slug: string, nombre: string, level: number, deltaCm: number) {
  return {
    level, state: 'normal', deltaCm,
    measuredAtIso: '2026-10-08', measuredAtProsa: '8 de octubre de 2026',
  };
}

describe('indexPage — intent, title and meta', () => {
  test('H1 states the intent with "hoy"', () => {
    expect(indexPage()).toContain('<h1>Altura del río Paraná hoy</h1>');
  });

  test('has the basin H2 above the table', () => {
    expect(indexPage()).toContain('<h2>Altura de los ríos de la cuenca del Paraná</h2>');
  });

  test('title stays within 65 characters', () => {
    const html = indexPage();
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
    expect(title.length).toBeGreaterThan(0);
    expect(title.length).toBeLessThanOrEqual(65);
  });

  test('title and meta name the intent, not just the brand', () => {
    const html = indexPage();
    expect(html).toMatch(/<title>Altura del río Paraná hoy:/);
    expect(html).toMatch(/<meta name="description" content="Altura del río Paraná hoy/);
  });
});

describe('indexPage — direct answer', () => {
  test('omits the answer sentence when there is no reading at all', () => {
    expect(indexPage()).not.toContain('Hoy el Paraná marca');
  });

  test('bakes the answer sentence from the readings handed to it', () => {
    const overrides = new Map([
      ['corrientes', overrideFor('corrientes', 'Corrientes', 2.4, -3)],
      ['rosario', overrideFor('rosario', 'Rosario', 3.13, 5)],
    ]);
    const html = indexPage(overrides);

    expect(html).toContain('Hoy el Paraná marca');
    expect(html).toContain('2,40 m en Corrientes');
    expect(html).toContain('3,13 m en Rosario');
    expect(html).toContain('medición de Prefectura del 8 de octubre de 2026');
  });
});

describe('indexPage — station table', () => {
  test('has one data row per published locality', () => {
    const html = indexPage();
    const rows = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? '';
    expect(rows.match(/<tr>/g)?.length).toBe(PUBLISHED_COUNT);
  });

  test('shows a fresh reading and its 24h delta when one is provided', () => {
    const overrides = new Map([['rosario', overrideFor('rosario', 'Rosario', 3.13, 5)]]);
    const html = indexPage(overrides);

    expect(html).toContain('3,13 m');
    expect(html).toContain('▲ 5 cm');
  });

  test('links every row to its own locality page', () => {
    expect(indexPage()).toContain('href="/rio/rosario/"');
  });
});

describe('indexPage — FAQ', () => {
  test('renders the visible FAQ entries', () => {
    const html = indexPage();
    for (const { q } of HUB_FAQ) expect(html).toContain(q);
  });

  test('ships a matching FAQPage JSON-LD block', () => {
    const html = indexPage();
    expect(html).toContain('"@type":"FAQPage"');
    for (const { a } of HUB_FAQ) expect(html).toContain(JSON.stringify(a).slice(1, -1));
  });
});

describe('indexPage — app install bar', () => {
  test('carries the rio campaign referrer', () => {
    const html = indexPage();
    expect(html).toContain('utm_campaign%3Drio"');
  });

  test('includes the install-bar script', () => {
    expect(indexPage()).toContain('app-bar-close');
  });
});

test('the station count used in copy matches what the table actually lists', () => {
  // Guards against the hub's "N estaciones" wording drifting from the table it
  // sits above — the same discipline the install bar already holds itself to.
  const html = indexPage();
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
  expect(title).toContain(`${STATION_COUNT} estaciones`);
});
