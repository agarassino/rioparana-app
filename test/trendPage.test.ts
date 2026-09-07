import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Runs the script exactly as it was published, against the markup it was
// published beside. A rename on one side and not the other is invisible to the
// unit tests and would only surface days later, once the API had enough
// history to draw — long after anyone would connect it to this change.
const PAGE = readFileSync(join(process.cwd(), 'landing/rio/rosario/index.html'), 'utf8');

function trendScript(): string {
  const blocks = PAGE.match(/<script>([\s\S]*?)<\/script>/g) ?? [];
  const block = blocks.find((b) => b.includes('river-trend'));
  if (!block) throw new Error('la página no trae el script de tendencia');
  return block.replace(/^<script>/, '').replace(/<\/script>$/, '');
}

/** The classes the published section actually offers the script. */
function sectionClasses(): Set<string> {
  const section = PAGE.match(/<section[^>]*id="river-trend"[\s\S]*?<\/section>/)?.[0];
  if (!section) throw new Error('la página no trae la sección de tendencia');
  return new Set([...section.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)));
}

/**
 * The smallest DOM the script touches — and no more. querySelector answers only
 * for classes the published markup really has, so a rename on one side shows up
 * here as a miss instead of being quietly absorbed.
 */
interface FakeNode {
  textContent: string;
  innerHTML: string;
  hidden: boolean;
  attrs: Record<string, string>;
  setAttribute(name: string, value: string): void;
}

const node = (): FakeNode => ({
  textContent: '',
  innerHTML: '',
  hidden: true,
  attrs: {},
  setAttribute(name, value) {
    this.attrs[name] = value;
  },
});

function fakeDom(sectionId = 'river-trend') {
  const available = sectionClasses();
  const nodes = new Map<string, FakeNode>();
  const section = {
    hidden: true,
    querySelector(sel: string) {
      if (!available.has(sel.replace(/^\./, ''))) return null;
      if (!nodes.has(sel)) nodes.set(sel, node());
      return nodes.get(sel)!;
    },
  };
  return {
    nodes,
    section,
    document: { getElementById: (id: string) => (id === sectionId ? section : null) },
  };
}

const daysAgo = (n: number, level: number) => ({
  timestamp: new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString(),
  level,
});

async function run(rows: unknown, opts: { ok?: boolean } = {}) {
  const dom = fakeDom();
  const fetchFn = () => Promise.resolve({ ok: opts.ok ?? true, json: async () => rows });
  new Function('document', 'window', 'fetch', trendScript())(
    dom.document, { fetch: fetchFn }, fetchFn
  );
  await new Promise((r) => setTimeout(r, 0));
  return dom;
}

describe('the published trend script', () => {
  test('fills every slot the section provides and reveals it', async () => {
    const dom = await run([daysAgo(4, 2.95), daysAgo(2, 3.1), daysAgo(1, 3.28)]);

    expect(dom.section.hidden).toBe(false);
    expect(dom.nodes.get('.trend-summary')!.textContent).toBe('Subió 33 cm en 3 días');
    expect(dom.nodes.get('.trend-chart')!.innerHTML).toContain('<polyline class="trend-line"');
    expect(dom.nodes.get('.trend-scale')!.textContent).toBe('Mínima 2.95 m · máxima 3.28 m');
    expect(dom.nodes.get('.trend-range')!.textContent).toContain('3 mediciones');
  });

  test('stays hidden while the API has no history yet', async () => {
    // This is the state on the day it ships, so it is the state that matters
    // most: the page must look untouched, not broken.
    expect((await run([])).section.hidden).toBe(true);
  });

  test('stays hidden on a single reading', async () => {
    expect((await run([daysAgo(1, 3)])).section.hidden).toBe(true);
  });

  test('stays hidden when the API errors', async () => {
    expect((await run([], { ok: false })).section.hidden).toBe(true);
  });

  test('asks the history endpoint for the station this page is about', () => {
    expect(trendScript()).toContain("/public/river/' + \"rosario\" + '/history");
  });

  test('carries the alert height this station actually publishes', () => {
    // Rosario alerts at 5 m; a wrong constant would draw a red line in the
    // wrong place, which is worse than drawing none.
    expect(trendScript()).toContain('alertLevel: 5');
  });
});

describe('the 24 h badge on the published page', () => {
  const hoursAgo = (h: number, level: number) => ({
    timestamp: new Date(Date.now() - h * 36e5).toISOString(),
    level,
  });

  test('shows the rise since yesterday and points up', async () => {
    const dom = await run([hoursAgo(48, 2.9), hoursAgo(24, 3.0), hoursAgo(1, 3.11)]);
    const day = dom.nodes.get('.trend-day')!;

    expect(day.hidden).toBe(false);
    expect(day.attrs['data-dir']).toBe('up');
    expect(dom.nodes.get('.trend-day-text')!.textContent).toBe('Subió 11 cm');
    expect(dom.nodes.get('.trend-day-detail')!.textContent).toBe('en las últimas 23 h');
  });

  test('points down when the river dropped', async () => {
    const dom = await run([hoursAgo(26, 3.4), hoursAgo(2, 3.28)]);

    expect(dom.nodes.get('.trend-day')!.attrs['data-dir']).toBe('down');
    expect(dom.nodes.get('.trend-day-text')!.textContent).toBe('Bajó 12 cm');
  });

  test('still draws the week when the day cannot be answered', async () => {
    // Readings four and five days old: the chart is honest, "since yesterday"
    // is not. The badge stays hidden and the section still opens.
    const dom = await run([hoursAgo(120, 2.9), hoursAgo(96, 3.1)]);

    expect(dom.section.hidden).toBe(false);
    // The badge ships hidden in the markup, so leaving it untouched is how it
    // stays hidden. Either way, nothing revealed it.
    expect(dom.nodes.get('.trend-day')?.hidden ?? true).toBe(true);
    expect(dom.nodes.get('.trend-summary')!.textContent).toBe('Subió 20 cm en 1 día');
  });
});
