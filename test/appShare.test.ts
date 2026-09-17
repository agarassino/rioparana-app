import { describe, expect, test } from 'vitest';
import { appShareMessage, PLAY_URL } from '../src/services/appShare';

describe('appShareMessage', () => {
  test('leads with what the app is for, not with its name', () => {
    // The person receiving it has never heard of it. "Paraná Info" alone
    // tells them nothing; the river does.
    expect(appShareMessage()).toMatch(/^Altura del río Paraná/);
  });

  test('carries the install link', () => {
    expect(appShareMessage()).toContain(PLAY_URL);
  });

  test('points at the listing, not at a web page', () => {
    // The point of this share is an install.
    expect(PLAY_URL).toContain('play.google.com');
    expect(PLAY_URL).toContain('com.syloper.rioparanaapp');
  });

  test('names the source, as everything else in this app does', () => {
    expect(appShareMessage()).toContain('Prefectura');
  });

  test('says how many stations, with the number that actually ships', () => {
    expect(appShareMessage()).toContain('38 estaciones');
  });

  test('carries the current reading when there is one', () => {
    const msg = appShareMessage({ stationName: 'Rosario', level: 2.54 });

    expect(msg).toContain('Rosario está en 2.54 m');
  });

  test('never invents a reading it does not have', () => {
    // Shared from a screen with no data, it is still a useful recommendation.
    expect(appShareMessage()).not.toMatch(/\d+\.\d{2} m/);
  });
});
