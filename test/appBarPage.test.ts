import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Runs the install bar exactly as published. The bar is the only path from an
// organic landing to the listing, so a wiring slip here costs installs
// silently — nothing on the page would look broken.
const PAGE = readFileSync(join(process.cwd(), 'landing/rio/rosario/index.html'), 'utf8');

function barScript(): string {
  const blocks = PAGE.match(/<script>([\s\S]*?)<\/script>/g) ?? [];
  const block = blocks.find((b) => b.includes('app-bar-close'));
  if (!block) throw new Error('la página no trae el script de la barra');
  return block.replace(/^<script>/, '').replace(/<\/script>$/, '');
}

interface Options {
  dismissed?: boolean;
  brokenStorage?: boolean;
  scrollY?: number;
  viewportH?: number;
  docH?: number;
}

function harness(opts: Options = {}) {
  const {
    dismissed = false, brokenStorage = false,
    scrollY = 0, viewportH = 800, docH = 2000,
  } = opts;

  const bar = { hidden: true };
  const closeHandlers: Array<() => void> = [];
  const closeBtn = {
    addEventListener: (_: string, fn: () => void) => closeHandlers.push(fn),
  };

  const saved: Record<string, string> = dismissed ? { 'pi.appbar.dismissed': '1' } : {};
  const localStorage = {
    getItem(k: string) {
      if (brokenStorage) throw new DOMException('denied');
      return k in saved ? saved[k] : null;
    },
    setItem(k: string, v: string) {
      if (brokenStorage) throw new DOMException('denied');
      saved[k] = v;
    },
  };

  const scrollHandlers: Array<() => void> = [];
  const events: Array<{ name: string; props: Record<string, unknown> }> = [];

  const document = {
    getElementById: (id: string) =>
      id === 'app-bar' ? bar : id === 'app-bar-close' ? closeBtn : null,
    documentElement: { scrollTop: scrollY, scrollHeight: docH },
  };

  const window = {
    localStorage,
    pageYOffset: scrollY,
    innerHeight: viewportH,
    addEventListener: (type: string, fn: () => void) => {
      if (type === 'scroll') scrollHandlers.push(fn);
    },
    removeEventListener: () => {},
  };

  const posthog = {
    capture: (name: string, props: Record<string, unknown>) => events.push({ name, props }),
  };

  new Function('document', 'window', 'localStorage', 'location', 'posthog', barScript())(
    document, window, localStorage, { pathname: '/rio/rosario/' }, posthog,
  );

  return {
    bar,
    saved,
    events,
    scroll(to: number) {
      window.pageYOffset = to;
      document.documentElement.scrollTop = to;
      scrollHandlers.forEach((fn) => fn());
    },
    close: () => closeHandlers.forEach((fn) => fn()),
  };
}

describe('the published install bar', () => {
  test('waits at the top of the page', () => {
    expect(harness().bar.hidden).toBe(true);
  });

  test('appears once the reader has gone a quarter down', () => {
    const h = harness();
    h.scroll(400);

    expect(h.bar.hidden).toBe(false);
  });

  test('appears at once on a page with nothing to scroll', () => {
    // No scroll event will ever fire there, so waiting for one hides the bar
    // for good — and that is the only install link on the page.
    expect(harness({ docH: 700, viewportH: 800 }).bar.hidden).toBe(false);
  });

  test('never returns after it was closed', () => {
    const h = harness({ dismissed: true });
    // Scrolling well past the threshold: without this the bar would stay
    // hidden for the wrong reason and the check would prove nothing.
    h.scroll(1200);

    expect(h.bar.hidden).toBe(true);
    expect(h.events).toEqual([]);
  });

  test('remembers a dismissal', () => {
    const h = harness();
    h.scroll(400);
    h.close();

    expect(h.bar.hidden).toBe(true);
    expect(h.saved['pi.appbar.dismissed']).toBe('1');
  });

  test('still closes when storage refuses to remember', () => {
    // Private-mode Safari throws on setItem. The bar must still go away for
    // this visit rather than leave a dead close button on screen.
    const h = harness({ brokenStorage: true });
    h.scroll(400);
    h.close();

    expect(h.bar.hidden).toBe(true);
  });

  test('counts the showing once, not on every scroll event', () => {
    const h = harness();
    h.scroll(400);
    h.scroll(600);
    h.scroll(900);

    expect(h.events.filter((e) => e.name === 'app_bar_shown')).toHaveLength(1);
  });

  test('counts a dismissal so the bar can be judged, not just admired', () => {
    const h = harness();
    h.scroll(400);
    h.close();

    expect(h.events.map((e) => e.name)).toEqual(['app_bar_shown', 'app_bar_dismiss']);
  });
});

describe('the install link the bar carries', () => {
  const bar = PAGE.match(/<aside class="app-bar"[\s\S]*?<\/aside>/)?.[0] ?? '';

  test('points at the real listing', () => {
    expect(bar).toContain(
      'https://play.google.com/store/apps/details?id=com.syloper.rioparanaapp'
    );
  });

  test('says where it is, so installs from here can be told apart', () => {
    // Without this the click lands in the same bucket as the home page hero and
    // there is no way to know whether the bar earns its space.
    expect(bar).toContain('data-cta="install"');
    expect(bar).toContain('data-cta-location="app_bar"');
  });

  test('claims only what actually ships', () => {
    // 38 stations served by /public/river, 997 features in the map geojson.
    // The listing was rejected once for a misleading claim; numbers on the site
    // get checked against the artefact, not remembered.
    expect(bar).toContain('38 estaciones');
  });

  test('gives the close button an accessible name', () => {
    expect(bar).toMatch(/aria-label="Cerrar[^"]*"/);
  });
});
