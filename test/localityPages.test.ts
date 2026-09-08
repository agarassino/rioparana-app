import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { localitySlugFor } from '../src/config/localityPages';
import { STATIONS } from '../src/config/stations';

interface Locality { slug: string; estacion?: string }

const localidades: Locality[] = JSON.parse(
  readFileSync(join(process.cwd(), 'landing/data/localidades.json'), 'utf8')
);
const pages = new Set(localidades.map((l) => l.slug));

describe('localitySlugFor', () => {
  test('every station the app lists has a page on the site', () => {
    // A shared reading links here. A station added to the app without a page
    // would put a 404 into someone's chat, and nothing in the app would show
    // it — this is the only place that catches it.
    const missing = STATIONS.filter((s) => !pages.has(localitySlugFor(s.id))).map((s) => s.id);

    expect(missing).toEqual([]);
  });

  test('resolves the two places whose page is not named after the station', () => {
    expect(localitySlugFor('libertad')).toBe('puerto-libertad');
    expect(localitySlugFor('martin-garcia')).toBe('isla-martin-garcia');
  });

  test('leaves every other station id alone', () => {
    expect(localitySlugFor('rosario')).toBe('rosario');
    expect(localitySlugFor('goya')).toBe('goya');
  });

  test('points at the page the site actually built for that station', () => {
    // Guards the mapping in the other direction: the site's own record of which
    // station a page reports.
    for (const l of localidades) {
      if (l.estacion) expect(localitySlugFor(l.estacion)).toBe(l.slug);
    }
  });
});
