import { describe, expect, test } from 'vitest';
import { clipboardText, sharePayload } from '../landing/scripts/share.mjs';

const base = {
  locality: 'Rosario',
  url: 'https://rioparana.com.ar/rio/rosario/',
};

describe('sharePayload', () => {
  test('leads with the reading, because that is what gets forwarded', () => {
    const p = sharePayload({ ...base, level: '3.12 m', day: 'Subió 8 cm en las últimas 24 h' });

    expect(p.text).toBe('Altura del río Paraná en Rosario: 3.12 m\nSubió 8 cm en las últimas 24 h');
  });

  test('keeps the url out of the text', () => {
    // The Web Share API appends the url itself; putting it in both makes it
    // appear twice in the message that lands in the chat.
    const p = sharePayload({ ...base, level: '3.12 m' });

    expect(p.text).not.toContain('rioparana.com.ar');
    expect(p.url).toBe(base.url);
  });

  test('never invents a number when there is no reading', () => {
    const p = sharePayload({ ...base, level: null });

    expect(p.text).toBe('Altura del río Paraná en Rosario');
    expect(p.text).not.toMatch(/\d/);
  });

  test('drops a placeholder as firmly as a missing value', () => {
    // The page shows an em dash until the API answers. Forwarding "Rosario: —"
    // is worse than forwarding nothing.
    expect(sharePayload({ ...base, level: '—' }).text).toBe('Altura del río Paraná en Rosario');
  });

  test('carries the alert distance when the river is near it', () => {
    const p = sharePayload({
      ...base, level: '4.85 m', alert: 'a 0.15 m del nivel de alerta',
      day: 'Subió 22 cm en las últimas 24 h',
    });

    expect(p.text).toBe(
      'Altura del río Paraná en Rosario: 4.85 m — a 0.15 m del nivel de alerta\n' +
      'Subió 22 cm en las últimas 24 h'
    );
  });

  test('omits the day line when the history cannot say', () => {
    const p = sharePayload({ ...base, level: '3.12 m', day: '' });

    expect(p.text).toBe('Altura del río Paraná en Rosario: 3.12 m');
  });

  test('titles the share with the locality', () => {
    expect(sharePayload({ ...base, level: '3.12 m' }).title)
      .toBe('Altura del río Paraná en Rosario');
  });
});

describe('clipboardText', () => {
  test('joins the message and the link, since nothing else will', () => {
    const p = sharePayload({ ...base, level: '3.12 m', day: 'Subió 8 cm en las últimas 24 h' });

    expect(clipboardText(p)).toBe(
      'Altura del río Paraná en Rosario: 3.12 m\nSubió 8 cm en las últimas 24 h\n' +
      'https://rioparana.com.ar/rio/rosario/'
    );
  });
});
