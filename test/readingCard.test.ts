import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { localityPage } from '../landing/scripts/build-directory.mjs';

// The reading card is the locality page's own install pitch: it sits right
// after the number the reader came for and offers the one thing the app adds
// — a daily push for the station that reader's device opens most. See
// landing/scripts/build-directory.mjs `readingCard()`.
interface Locality {
  slug: string;
  nombre: string;
  provincia: string;
  lat: number;
  lon: number;
  estacion?: string;
  alerta?: number;
  evacuacion?: number;
}

const localidades: Locality[] = JSON.parse(
  readFileSync(join(process.cwd(), 'landing/data/localidades.json'), 'utf8'),
);

function locality(slug: string): Locality {
  const loc = localidades.find((l) => l.slug === slug);
  if (!loc) throw new Error(`fixture locality not found: ${slug}`);
  return loc;
}

// The app was previously rejected by Google Play for claiming threshold/alert
// notifications it does not send. It only ever sends one push a day, at 07:00,
// for the station a device opens most — never "avisamos cuando suba/baje".
// `alerta` legitimately appears in "cómo está frente al nivel de alerta" (a state,
// not a promise to notify), so the guard only matches wording that promises a
// notification tied to a threshold.
const ALERT_PROMISE = /avis(a|o|ame)|alerta cuando|cuando (suba|baje)/i;

describe('reading card on a locality page', () => {
  const rosario = locality('rosario'); // has its own station
  const html = localityPage(rosario);

  test('sits right after the reading/gauge/margin/source block, before the hub link and share buttons', () => {
    const srcIdx = html.indexOf('id="river-src"');
    const cardIdx = html.indexOf('reading-card');
    const hubLinkIdx = html.indexOf('Ver la altura en todo el río');
    const shareIdx = html.indexOf('id="share-wa"');

    expect(srcIdx).toBeGreaterThan(-1);
    expect(cardIdx).toBeGreaterThan(srcIdx);
    expect(cardIdx).toBeLessThan(hubLinkIdx);
    expect(cardIdx).toBeLessThan(shareIdx);
  });

  test('heading names the locality that has its own station', () => {
    expect(html).toContain('Recibí la altura del río en Rosario cada mañana a las 7.');
  });

  test('body states the real, truthful behaviour (not a threshold alert)', () => {
    expect(html).toContain(
      'Gratis en la app Paraná Info para Android: cuánto subió o bajó desde ayer y cómo está ' +
        'frente al nivel de alerta. Te llega la de la localidad que más consultás.',
    );
  });

  test('button links to Play with the reading_card medium and the page campaign', () => {
    const href = /reading-card[\s\S]*?href="([^"]+)"/.exec(html)?.[1];
    expect(href).toBeTruthy();
    expect(href).toContain('play.google.com');
    expect(href).toContain('utm_medium%3Dreading_card');
    expect(href).toContain('utm_campaign%3Drio-rosario');
  });

  test('button carries the install CTA tracking attributes', () => {
    expect(html).toMatch(/data-cta="install"\s+data-cta-location="reading_card"/);
  });

  test('button text is the Play Store CTA', () => {
    expect(html).toMatch(/reading-card-cta[^>]*>Instalar en Google Play<\/a>/);
  });
});

describe('reading card on a locality page without its own station', () => {
  const sanJavier = locality('san-javier');
  const html = localityPage(sanJavier);

  test('the page borrows a neighbour station for its reading', () => {
    // Sanity check on the fixture itself: san-javier has no `estacion`, so it
    // must be showing a borrowed reading, not its own.
    expect(sanJavier.estacion).toBeUndefined();
    expect(html).toMatch(/Lectura de la estación ([^,]+), a \d+ km\./);
  });

  test('card heading uses the borrowed station name, matching the page\'s own source line', () => {
    const sourceStation = /Lectura de la estación ([^,]+), a \d+ km\./.exec(html)?.[1];
    expect(sourceStation).toBeTruthy();
    expect(html).toContain(`Recibí la altura del río en ${sourceStation} cada mañana a las 7.`);
    // And not the borrowing locality's own name, which would be false — San
    // Javier itself has no gauge to report a reading for.
    expect(html).not.toContain('Recibí la altura del río en San Javier cada mañana a las 7.');
  });
});

describe('reading card copy guard — no alert-promise wording', () => {
  for (const slug of ['rosario', 'san-javier']) {
    test(`${slug}: heading and button never promise a threshold notification`, () => {
      const html = localityPage(locality(slug));
      const head = /<p class="reading-card-head">.*?<\/p>/.exec(html)?.[0] ?? '';
      const cta = /reading-card-cta[^>]*>.*?<\/a>/.exec(html)?.[0] ?? '';

      expect(head).toBeTruthy();
      expect(cta).toBeTruthy();
      expect(head).not.toMatch(ALERT_PROMISE);
      expect(cta).not.toMatch(ALERT_PROMISE);
    });

    test(`${slug}: body legitimately mentions "alerta" as a distance, not a promise`, () => {
      const html = localityPage(locality(slug));
      const body = /<p class="reading-card-body">.*?<\/p>/.exec(html)?.[0] ?? '';

      expect(body).toContain('alerta');
      expect(body).not.toMatch(ALERT_PROMISE);
    });
  }
});
