import { describe, expect, test } from 'vitest';
import {
  DISMISS_KEY, isDismissed, rememberDismissal, shouldReveal,
} from '../landing/scripts/appbar.mjs';

/** A localStorage double. `broken` throws the way Safari does in private mode. */
function store(initial: Record<string, string> = {}, broken = false) {
  const data = { ...initial };
  return {
    getItem(k: string) {
      if (broken) throw new DOMException('denied');
      return k in data ? data[k] : null;
    },
    setItem(k: string, v: string) {
      if (broken) throw new DOMException('denied');
      data[k] = v;
    },
    data,
  };
}

describe('isDismissed', () => {
  test('is false for a reader who has not closed the bar', () => {
    expect(isDismissed(store())).toBe(false);
  });

  test('is true once the bar was closed', () => {
    expect(isDismissed(store({ [DISMISS_KEY]: '1' }))).toBe(true);
  });

  test('does not crash the page when storage is unavailable', () => {
    // Safari in private mode throws on access rather than returning null.
    expect(isDismissed(store({}, true))).toBe(false);
    expect(isDismissed(null)).toBe(false);
  });
});

describe('rememberDismissal', () => {
  test('records the dismissal so the bar stays closed', () => {
    const s = store();
    rememberDismissal(s);

    expect(isDismissed(s)).toBe(true);
  });

  test('swallows a storage failure rather than breaking the close button', () => {
    // Failing to remember is a small annoyance; an exception here would leave
    // the bar on screen and the click apparently dead.
    expect(() => rememberDismissal(store({}, true))).not.toThrow();
    expect(() => rememberDismissal(null)).not.toThrow();
  });
});

describe('shouldReveal', () => {
  test('shows at once when there is nothing to scroll', () => {
    // A page that fits the viewport never fires a scroll event, so waiting for
    // one would hide the bar forever.
    expect(shouldReveal({ scrollY: 0, viewportH: 800, docH: 800 })).toBe(true);
    expect(shouldReveal({ scrollY: 0, viewportH: 800, docH: 600 })).toBe(true);
  });

  test('stays away until the reader has actually read something', () => {
    expect(shouldReveal({ scrollY: 0, viewportH: 800, docH: 2000 })).toBe(false);
  });

  test('appears past a quarter of the page', () => {
    // 1200 scrollable, a quarter is 300.
    expect(shouldReveal({ scrollY: 299, viewportH: 800, docH: 2000 })).toBe(false);
    expect(shouldReveal({ scrollY: 300, viewportH: 800, docH: 2000 })).toBe(true);
  });

  test('does not make a long page wait forever', () => {
    // A quarter of 19200 would be 4800px of scrolling before the bar appears.
    expect(shouldReveal({ scrollY: 800, viewportH: 800, docH: 20000 })).toBe(true);
  });
});
