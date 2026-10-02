import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs without types
import { riverTitle } from '../landing/scripts/title.mjs';

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
