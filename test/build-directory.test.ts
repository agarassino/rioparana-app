import { describe, expect, test } from 'vitest';
import { localityPage, indexPage, typePage } from '../landing/scripts/build-directory.mjs';

// Regression test for the cross-site "Sitios de la red" footer (commit
// 21eb11b). It used to be pasted by hand into every already-generated page
// instead of living in the generator's shared FOOT template, so a regen
// silently dropped it. This asserts the generator itself emits it, for every
// kind of page it builds, through the real exported render functions —
// importing build-directory.mjs must not touch the network or the filesystem
// (see the isEntryPoint guard at the bottom of that file).
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

describe('network footer', () => {
  test('is present on a locality page', () => {
    expect(localityPage(loc)).toContain('Sitios de la red');
  });

  test('is present on the /rio/ hub page', () => {
    expect(indexPage()).toContain('Sitios de la red');
  });

  test('is present on a service-type page', () => {
    expect(typePage('guia-pesca')).toContain('Sitios de la red');
  });

  test('links to the sibling sites, not just the label', () => {
    const html = localityPage(loc);
    expect(html).toContain('https://cobranzaspymes.com.ar/');
    expect(html).toContain('https://centrosdesalud.com.ar/');
  });
});
