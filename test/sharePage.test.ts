import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Exercises the share script exactly as published. The message it builds is
// read off the rendered page, so this is the only place the wiring between the
// two is checked.
const PAGE = readFileSync(join(process.cwd(), 'landing/rio/rosario/index.html'), 'utf8');

function shareScript(): string {
  const blocks = PAGE.match(/<script>([\s\S]*?)<\/script>/g) ?? [];
  const block = blocks.find((b) => b.includes('share-river'));
  if (!block) throw new Error('la página no trae el script de compartir');
  return block.replace(/^<script>/, '').replace(/<\/script>$/, '');
}

interface Options {
  level?: string;
  state?: string;
  day?: [string, string] | null;
  share?: ((p: unknown) => Promise<void>) | null;
  clipboard?: { writeText(t: string): Promise<void> } | null;
}

function harness(opts: Options = {}) {
  const {
    level = '3.12 m',
    state = 'live',
    day = ['Subió 8 cm', 'en las últimas 24 h'],
    share = async () => {},
    clipboard = { writeText: async () => {} },
  } = opts;

  const label = { textContent: 'Compartir' };
  const clicks: Array<() => void> = [];
  const button = {
    hidden: true,
    querySelector: (sel: string) => (sel === '.share-label' ? label : null),
    addEventListener: (_: string, fn: () => void) => clicks.push(fn),
  };

  const riverNow = {
    textContent: level,
    getAttribute: (name: string) => (name === 'data-state' ? state : null),
  };

  const trendDay = {
    hidden: day === null,
    querySelector: (sel: string) => ({
      textContent: sel === '.trend-day-text' ? day?.[0] ?? '' : day?.[1] ?? '',
    }),
  };

  const shared: unknown[] = [];
  const copied: string[] = [];
  const events: Array<{ name: string; props: Record<string, unknown> }> = [];

  const document = {
    getElementById: (id: string) =>
      id === 'share-river' ? button : id === 'river-now' ? riverNow : null,
    querySelector: (sel: string) =>
      sel === '.trend-day'
        ? trendDay
        : sel === 'link[rel="canonical"]'
          ? { href: 'https://rioparana.com.ar/rio/rosario/' }
          : null,
  };

  const navigator: Record<string, unknown> = {};
  if (share) {
    navigator.share = (p: unknown) => {
      shared.push(p);
      return share(p);
    };
  }
  if (clipboard) {
    navigator.clipboard = {
      writeText: (t: string) => {
        copied.push(t);
        return clipboard.writeText(t);
      },
    };
  }

  const posthog = {
    capture: (name: string, props: Record<string, unknown>) => events.push({ name, props }),
  };

  new Function('document', 'navigator', 'location', 'posthog', 'setTimeout', shareScript())(
    document,
    navigator,
    { pathname: '/rio/rosario/', href: 'https://rioparana.com.ar/rio/rosario/?utm=x' },
    posthog,
    () => 0,
  );

  return {
    button,
    label,
    shared,
    copied,
    events,
    click: async () => {
      clicks.forEach((fn) => fn());
      await new Promise((r) => setTimeout(r, 0));
    },
  };
}

describe('the published share script', () => {
  test('shows the button once the browser can share', () => {
    expect(harness().button.hidden).toBe(false);
  });

  test('stays hidden when the browser can neither share nor copy', () => {
    // A button that does nothing when tapped is worse than no button.
    expect(harness({ share: null, clipboard: null }).button.hidden).toBe(true);
  });

  test('forwards the reading that is on the screen', async () => {
    const h = harness();
    await h.click();

    expect(h.shared[0]).toEqual({
      title: 'Altura del río Paraná en Rosario',
      text: 'Altura del río Paraná en Rosario: 3.12 m\nSubió 8 cm en las últimas 24 h',
      url: 'https://rioparana.com.ar/rio/rosario/',
    });
  });

  test('leaves the alert distance out when the page is not flagging it', async () => {
    const h = harness({ level: '3.12 m · a 1.88 m del nivel de alerta', state: 'live' });
    await h.click();

    expect((h.shared[0] as { text: string }).text).not.toContain('nivel de alerta');
  });

  test('carries the alert distance when the page is flagging it', async () => {
    const h = harness({ level: '4.85 m · a 0.15 m del nivel de alerta', state: 'near-alert' });
    await h.click();

    expect((h.shared[0] as { text: string }).text)
      .toContain('4.85 m — a 0.15 m del nivel de alerta');
  });

  test('omits the day line while the badge is hidden', async () => {
    const h = harness({ day: null });
    await h.click();

    expect((h.shared[0] as { text: string }).text).toBe('Altura del río Paraná en Rosario: 3.12 m');
  });

  test('shares the canonical url, not the one with tracking on it', async () => {
    const h = harness();
    await h.click();

    expect((h.shared[0] as { url: string }).url).toBe('https://rioparana.com.ar/rio/rosario/');
  });

  test('counts a completed share', async () => {
    const h = harness();
    await h.click();

    expect(h.events).toEqual([
      { name: 'share_click', props: { method: 'native', page: '/rio/rosario/' } },
    ]);
  });

  test('does not count a share the reader cancelled', async () => {
    // navigator.share rejects on cancel. Counting that would inflate the only
    // number that says whether this button is worth keeping.
    const h = harness({ share: () => Promise.reject(new Error('AbortError')) });
    await h.click();

    expect(h.events).toEqual([]);
  });

  test('copies to the clipboard when there is no native share', async () => {
    const h = harness({ share: null });
    await h.click();

    expect(h.copied[0]).toBe(
      'Altura del río Paraná en Rosario: 3.12 m\nSubió 8 cm en las últimas 24 h\n' +
      'https://rioparana.com.ar/rio/rosario/'
    );
    expect(h.label.textContent).toBe('Copiado');
    expect(h.events[0].props.method).toBe('clipboard');
  });

  test('says so when the copy fails instead of claiming success', async () => {
    const h = harness({
      share: null,
      clipboard: { writeText: () => Promise.reject(new Error('denied')) },
    });
    await h.click();

    expect(h.label.textContent).toBe('No se pudo copiar');
    expect(h.events).toEqual([]);
  });
});
