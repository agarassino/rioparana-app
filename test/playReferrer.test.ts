import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Every published link to the Play listing must carry an install referrer,
// or Play Console cannot tell which site, page or CTA position sent the
// install. A link that is missing it costs attribution silently — nothing on
// the page itself would look broken.
const LANDING = join(process.cwd(), 'landing');

function playHrefs(html: string): string[] {
  return (html.match(/href="[^"]*play\.google\.com[^"]*"/g) ?? [])
    .map((h) => h.slice('href="'.length, -1));
}

function localityPages(): Array<{ path: string; campaign: string }> {
  return readdirSync(join(LANDING, 'rio'), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({ path: `rio/${e.name}/index.html`, campaign: `rio-${e.name}` }));
}

const pages = [{ path: 'index.html', campaign: 'home' }, ...localityPages()];

describe('every Play Store link on the published landing', () => {
  for (const { path, campaign } of pages) {
    test(`${path} carries a referrer attributed to its own campaign`, () => {
      const html = readFileSync(join(LANDING, path), 'utf8');
      const hrefs = playHrefs(html);

      expect(hrefs.length).toBeGreaterThan(0);
      for (const href of hrefs) {
        expect(href).toMatch(/&(?:amp;)?referrer=/);
        expect(href).toContain('utm_source%3Drioparana.com.ar');
        expect(href).toContain(`utm_campaign%3D${campaign}`);
      }
    });
  }
});
