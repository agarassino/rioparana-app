// The install bar shown on locality pages.
//
// Those pages carry the organic traffic and had no link to the listing at all,
// so a reader who arrived from a search had no way to install. A slim, sticky,
// dismissible bar is what Google's own guidance allows; a covering interstitial
// is what it penalises, which is why this is a bar and not a popup.

export const DISMISS_KEY = 'pi.appbar.dismissed';
// A quarter of the page: enough to tell a reader from a bounce.
export const SHOW_RATIO = 0.25;
// …but never more than this much scrolling, so a long page still gets asked.
export const MAX_SCROLL_PX = 800;

/** True once the reader has closed the bar. Never throws. */
export function isDismissed(storage) {
  try {
    return storage.getItem(DISMISS_KEY) === '1';
  } catch {
    // Private-mode Safari throws on access, and a missing store is the same
    // answer: we have no record, so the bar may show.
    return false;
  }
}

/** Remember a dismissal. Failing to is a small annoyance, not an error. */
export function rememberDismissal(storage) {
  try {
    storage.setItem(DISMISS_KEY, '1');
  } catch {
    // An exception here would leave the bar on screen with a dead close button.
  }
}

/** Whether the reader has gone far enough to be worth asking. */
export function shouldReveal({ scrollY, viewportH, docH }, ratio = SHOW_RATIO) {
  const scrollable = docH - viewportH;
  // Nothing to scroll: no scroll event will ever arrive, so ask now.
  if (scrollable <= 0) return true;

  return scrollY >= Math.min(scrollable * ratio, MAX_SCROLL_PX);
}
