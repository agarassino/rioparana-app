// Builds the Google Play listing URL carrying a Play Console install
// referrer, so installs can be attributed back to this site, the page that
// sent them, and the exact CTA position on that page — without this, every
// install looks identical in Play Console.
const PLAY_ID = 'com.syloper.rioparanaapp';
const SOURCE = 'rioparana.com.ar';

/**
 * @param {{ medium: string, campaign: string }} params
 *   medium — CTA position, using the same vocabulary as the `install_click`
 *   PostHog event's `location` (see landing/analytics.js).
 *   campaign — page id: "home" for the index page, "rio-<slug>" for a
 *   locality page.
 */
export function playUrl({ medium, campaign }) {
  const referrer = `utm_source=${SOURCE}&utm_medium=${medium}&utm_campaign=${campaign}`;
  return `https://play.google.com/store/apps/details?id=${PLAY_ID}&referrer=${encodeURIComponent(referrer)}`;
}
