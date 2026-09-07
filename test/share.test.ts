import { describe, expect, test } from 'vitest';
import { clipboardText, sharePayload, whatsappUrl } from '../landing/scripts/share.mjs';

const base = {
  locality: 'Rosario',
  url: 'https://rioparana.com.ar/rio/rosario/',
};

describe('sharePayload', () => {
  test('leads with the reading, because that is what gets forwarded', () => {
    const p = sharePayload({ ...base, level: '3.12 m', day: 'Subió 8 cm en las últimas 24 h' });

    expect(p.text).toBe(
      'Altura del río Paraná en Rosario: 3.12 m\nSubió 8 cm en las últimas 24 h\n\nVía Paraná Info'
    );
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

    expect(p.text).toBe('Altura del río Paraná en Rosario\n\nVía Paraná Info');
    expect(p.text).not.toMatch(/\d/);
  });

  test('drops a placeholder as firmly as a missing value', () => {
    // The page shows an em dash until the API answers. Forwarding "Rosario: —"
    // is worse than forwarding nothing.
    expect(sharePayload({ ...base, level: '—' }).text)
      .toBe('Altura del río Paraná en Rosario\n\nVía Paraná Info');
  });

  test('carries the alert distance when the river is near it', () => {
    const p = sharePayload({
      ...base, level: '4.85 m', alert: 'a 0.15 m del nivel de alerta',
      day: 'Subió 22 cm en las últimas 24 h',
    });

    expect(p.text).toBe(
      'Altura del río Paraná en Rosario: 4.85 m — a 0.15 m del nivel de alerta\n' +
      'Subió 22 cm en las últimas 24 h\n\nVía Paraná Info'
    );
  });

  test('omits the day line when the history cannot say', () => {
    const p = sharePayload({ ...base, level: '3.12 m', day: '' });

    expect(p.text).toBe('Altura del río Paraná en Rosario: 3.12 m\n\nVía Paraná Info');
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
      '\nVía Paraná Info\nhttps://rioparana.com.ar/rio/rosario/'
    );
  });
});

describe('whatsappUrl', () => {
  const p = sharePayload({ ...base, level: '3.12 m', day: 'Subió 8 cm en las últimas 24 h' });

  test('opens a chooser rather than a fixed number', () => {
    // wa.me with no phone lets the sender pick the chat, and it resolves to the
    // app on a phone and to WhatsApp Web on a desktop without branching.
    expect(whatsappUrl(p).startsWith('https://wa.me/?text=')).toBe(true);
  });

  test('carries the whole message, link included', () => {
    const sent = decodeURIComponent(whatsappUrl(p).replace('https://wa.me/?text=', ''));

    expect(sent).toBe(clipboardText(p));
  });

  test('encodes the newlines instead of letting them break the url', () => {
    expect(whatsappUrl(p)).not.toContain('\n');
    expect(whatsappUrl(p)).toContain('%0A');
  });

  test('names the source, so a stranger who gets it knows where to go', () => {
    expect(decodeURIComponent(whatsappUrl(p))).toContain('Vía Paraná Info');
    expect(decodeURIComponent(whatsappUrl(p))).toContain('rioparana.com.ar');
  });
});
