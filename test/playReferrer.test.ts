import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Every published link to the Play listing must carry an install referrer,
// or Play Console cannot tell which site, page or CTA position sent the
// install. A link that is missing it costs attribution silently — nothing on
// the page itself would look broken.
//
// A page can carry more than one Play link (e.g. a locality page has both the
// sticky app bar and the reading card), so this scans all of them per page
// and checks each has its own valid medium, not just the shared campaign.
const LANDING = join(process.cwd(), 'landing');

function playLinks(html: string): Array<{ href: string; medium: string | null }> {
  return (html.match(/href="[^"]*play\.google\.com[^"]*"/g) ?? []).map((h) => {
    const href = h.slice('href="'.length, -1);
    const medium = /utm_medium%3D([a-z_]+)/.exec(href)?.[1] ?? null;
    return { href, medium };
  });
}

function localityPages(): Array<{ path: string; campaign: string }> {
  return readdirSync(join(LANDING, 'rio'), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({ path: `rio/${e.name}/index.html`, campaign: `rio-${e.name}` }));
}

const pages = [
  { path: 'index.html', campaign: 'home' },
  { path: 'rio/index.html', campaign: 'rio' },
  ...localityPages(),
];

describe('every Play Store link on the published landing', () => {
  for (const { path, campaign } of pages) {
    test(`${path} carries a referrer attributed to its own campaign`, () => {
      const html = readFileSync(join(LANDING, path), 'utf8');
      const links = playLinks(html);

      expect(links.length).toBeGreaterThan(0);
      for (const { href, medium } of links) {
        expect(href).toMatch(/&(?:amp;)?referrer=/);
        expect(href).toContain('utm_source%3Drioparana.com.ar');
        expect(href).toContain(`utm_campaign%3D${campaign}`);
        // A known medium: a real CTA position, never missing or malformed.
        expect(medium).toMatch(/^[a-z_]+$/);
      }
    });
  }
});

describe('locality pages carry both the sticky bar and the reading-card referrers', () => {
  for (const { path } of localityPages()) {
    test(`${path} has exactly one app_bar link and one reading_card link`, () => {
      const html = readFileSync(join(LANDING, path), 'utf8');
      const media = playLinks(html).map((l) => l.medium);

      expect(media.filter((m) => m === 'app_bar')).toHaveLength(1);
      expect(media.filter((m) => m === 'reading_card')).toHaveLength(1);
    });
  }
});
