import { describe, expect, test } from 'vitest';
import { playUrl } from '../landing/scripts/play-url.mjs';

// Play Console attributes an install to a referrer string passed on the
// listing URL. Without it every install looks the same regardless of which
// page or CTA sent the reader there.
describe('playUrl', () => {
  test('builds the listing URL with a UTM referrer Play Console can read', () => {
    expect(playUrl({ medium: 'hero', campaign: 'home' })).toBe(
      'https://play.google.com/store/apps/details?id=com.syloper.rioparanaapp' +
        '&referrer=utm_source%3Drioparana.com.ar%26utm_medium%3Dhero%26utm_campaign%3Dhome',
    );
  });

  test('gives distinct campaigns distinct referrers', () => {
    const home = playUrl({ medium: 'app_bar', campaign: 'home' });
    const rosario = playUrl({ medium: 'app_bar', campaign: 'rio-rosario' });

    expect(home).not.toBe(rosario);
  });
});
