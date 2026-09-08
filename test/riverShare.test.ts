import { describe, expect, test } from 'vitest';
import { shareMessage } from '../src/services/riverShare';
import type { WaterLevel } from '../src/types';

const at = (level: number, over: Partial<WaterLevel> = {}): WaterLevel => ({
  stationId: 'rosario',
  timestamp: new Date('2026-09-08T12:00:00Z'),
  level,
  trend: 'stable',
  changeRate: 0,
  alertLevel: 5,
  evacuationLevel: 5.3,
  ...over,
});

describe('shareMessage', () => {
  test('leads with the reading, because that is what gets forwarded', () => {
    expect(shareMessage('Rosario', at(2.42))).toBe(
      'Altura del río Paraná en Rosario: 2.42 m\n\nVía Paraná Info\nhttps://rioparana.com.ar/'
    );
  });

  test('adds what the river did since yesterday when the history can say', () => {
    expect(shareMessage('Rosario', at(2.42), { cm: 8, hours: 24 })).toContain(
      'Subió 8 cm en las últimas 24 h'
    );
  });

  test('carries the alert distance only when the river is near it', () => {
    // At 2.42 m against an alert of 5 m the margin is noise; at 4.85 m it is
    // the most important thing in the message.
    expect(shareMessage('Rosario', at(2.42))).not.toContain('alerta');
    expect(shareMessage('Goya', at(4.85))).toContain('a 0.15 m del nivel de alerta');
  });

  test('says the river is over the alert instead of counting down past it', () => {
    expect(shareMessage('Goya', at(5.1))).toContain('supera el nivel de alerta');
  });

  test('names the source, for whoever the message is forwarded to', () => {
    // The message travels past the person who sent it. The signature is what
    // tells a stranger where the number came from.
    const msg = shareMessage('Rosario', at(2.42));

    expect(msg).toContain('Vía Paraná Info');
    expect(msg).toContain('https://rioparana.com.ar/');
  });

  test('points at the locality page when the station has one', () => {
    expect(shareMessage('Rosario', at(2.42), null, 'rosario')).toContain(
      'https://rioparana.com.ar/rio/rosario/'
    );
  });

  test('never invents a number it does not have', () => {
    const msg = shareMessage('Rosario', { ...at(2.42), alertLevel: undefined });

    expect(msg).toContain('2.42 m');
    expect(msg).not.toContain('alerta');
  });
});
