import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs without types
import { riverTitle, hubTitle } from '../landing/scripts/title.mjs';

describe('riverTitle', () => {
  it('leads with the reading and the alert threshold', () => {
    expect(riverTitle({ nombre: 'Rosario', level: 2.94, alertLevel: 5 }))
      .toBe('Río Paraná en Rosario hoy: 2,94 m (alerta 5 m) — Prefectura');
  });

  it('drops the province suffix when a reading exists', () => {
    expect(riverTitle({ nombre: 'Paraná (Entre Ríos)', level: 3.25, alertLevel: 4.7 }))
      .toBe('Río Paraná en Paraná hoy: 3,25 m (alerta 4,7 m) — Prefectura');
  });

  it('drops the brand suffix when it would exceed 65 characters', () => {
    const t = riverTitle({ nombre: 'Isla Martín García', level: 1.23, alertLevel: 3 });
    expect(t).toBe('Río Paraná en Isla Martín García hoy: 1,23 m (alerta 3 m)');
    expect(t.length).toBeLessThanOrEqual(65);
  });

  it('falls back to the static title without a reading', () => {
    expect(riverTitle({ nombre: 'Rosario', level: null, alertLevel: 5 }))
      .toBe('Altura del río Paraná en Rosario hoy — Prefectura Naval | Paraná Info');
    expect(riverTitle({ nombre: 'Paraná (Entre Ríos)', level: null, alertLevel: 4.7, fallback: 'X' })).toBe('X');
  });
});

describe('hubTitle', () => {
  it('leads with the intent and the station count', () => {
    const t = hubTitle({ count: 38 });
    expect(t).toBe('Altura del río Paraná hoy: 38 estaciones — Prefectura');
    expect(t.length).toBeLessThanOrEqual(65);
  });

  it('drops the date when it would exceed 65 characters', () => {
    const t = hubTitle({ count: 38, dateProsa: '8 de octubre de 2026' });
    expect(t).toBe('Altura del río Paraná hoy: 38 estaciones — Prefectura');
  });

  it('stays under 65 characters for every real station count', () => {
    for (const count of [1, 9, 38, 39, 100]) {
      expect(hubTitle({ count }).length).toBeLessThanOrEqual(65);
    }
  });
});
