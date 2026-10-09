import { describe, expect, test } from 'vitest';
import { localityPage } from '../landing/scripts/build-directory.mjs';

const loc = {
  slug: 'test-locality',
  nombre: 'Test Locality',
  provincia: 'Test',
  lat: -32,
  lon: -60,
  estacion: 'test-locality',
  alerta: 5,
  evacuacion: 6,
};

const parana = {
  slug: 'parana',
  nombre: 'Paraná',
  provincia: 'Entre Ríos',
  lat: -31.73,
  lon: -60.52,
  estacion: 'parana',
  alerta: 5.75,
  evacuacion: 6.5,
};

describe('locality page breadcrumb to the hub', () => {
  test('the visible crumb names the intent, not just "Localidades"', () => {
    const html = localityPage(loc);
    expect(html).toContain('<a href="/rio/">Altura del río Paraná hoy</a>');
    expect(html).not.toContain('<a href="/rio/">Localidades</a>');
  });

  test('the breadcrumb JSON-LD matches the visible crumb', () => {
    const html = localityPage(loc);
    expect(html).toContain('"name":"Altura del río Paraná hoy"');
  });
});

describe('locality page link back to the full river', () => {
  test('links to the hub near the reading', () => {
    const html = localityPage(loc);
    expect(html).toContain('href="/rio/"');
    expect(html).toContain('Ver la altura en todo el río');
  });
});

describe('the Paraná locality page', () => {
  test('calls out the hub prominently for readers who searched the whole river', () => {
    const html = localityPage(parana);
    expect(html).toMatch(/¿Buscás la altura en todo el río Paraná\?/);
    expect(html).toContain('href="/rio/"');
  });

  test('other locality pages do not carry that callout', () => {
    expect(localityPage(loc)).not.toMatch(/¿Buscás la altura en todo el río Paraná\?/);
  });
});
