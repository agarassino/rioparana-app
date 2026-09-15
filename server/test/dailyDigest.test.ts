import { describe, expect, it } from 'vitest';
import { composeDaily } from '../src/services/dailyDigest.js';

const NOW = new Date('2026-09-15T12:00:00Z');
const reading = (level: number, hoursOld = 2) => ({
  level,
  timestamp: new Date(NOW.getTime() - hoursOld * 3600_000).toISOString(),
  alertLevel: 5,
  evacuationLevel: 5.3,
});

describe('composeDaily', () => {
  it('leads with the station and the reading', () => {
    const msg = composeDaily('Rosario', reading(2.54), { cm: 6, hours: 24 }, NOW)!;

    expect(msg.title).toBe('Rosario · 2.54 m');
  });

  it('says what the river did since yesterday', () => {
    const msg = composeDaily('Rosario', reading(2.54), { cm: 6, hours: 24 }, NOW)!;

    expect(msg.body).toBe('Subió 6 cm desde ayer. A 2.46 m del nivel de alerta.');
  });

  it('says when the river fell', () => {
    const msg = composeDaily('Goya', reading(3.1), { cm: -12, hours: 24 }, NOW)!;

    expect(msg.body).toContain('Bajó 12 cm desde ayer');
  });

  it('says plainly when nothing moved', () => {
    const msg = composeDaily('Goya', reading(3.1), { cm: 0, hours: 24 }, NOW)!;

    expect(msg.body).toContain('Sin cambios desde ayer');
  });

  it('drops the movement when the history cannot say', () => {
    // A device on a station whose history has a gap still gets the reading,
    // which is the part it opened the app for.
    const msg = composeDaily('Rosario', reading(2.54), null, NOW)!;

    expect(msg.body).toBe('A 2.46 m del nivel de alerta.');
  });

  it('puts the alert first once the river is close to it', () => {
    // At ten centimetres the margin is the message; the daily habit is not.
    const msg = composeDaily('Goya', reading(4.9), { cm: 22, hours: 24 }, NOW)!;

    expect(msg.body).toBe('A 0.10 m del nivel de alerta. Subió 22 cm desde ayer.');
  });

  it('says the river is over the alert instead of counting down past it', () => {
    const msg = composeDaily('Goya', reading(5.1), { cm: 8, hours: 24 }, NOW)!;

    expect(msg.body).toContain('Supera el nivel de alerta');
    expect(msg.body).not.toContain('-');
  });

  it('names evacuation when the river reaches it', () => {
    const msg = composeDaily('Goya', reading(5.4), { cm: 8, hours: 24 }, NOW)!;

    expect(msg.body).toContain('Supera el nivel de evacuación');
  });

  it('still sends a reading for a station with no alert height published', () => {
    const msg = composeDaily(
      'Tigre',
      { ...reading(1.2), alertLevel: undefined, evacuationLevel: undefined },
      { cm: 3, hours: 24 },
      NOW,
    )!;

    expect(msg.title).toBe('Tigre · 1.20 m');
    expect(msg.body).toBe('Subió 3 cm desde ayer.');
  });

  it('sends nothing when the reading is too old to be today', () => {
    // The pusher runs from one laptop. If it stopped, yesterday's number must
    // not go out as a notification headed "today" — a wrong river height is
    // worse than no notification.
    expect(composeDaily('Rosario', reading(2.54, 30), { cm: 6, hours: 24 }, NOW)).toBeNull();
  });

  it('sends nothing without a reading at all', () => {
    expect(composeDaily('Rosario', null, null, NOW)).toBeNull();
  });

  it('carries the station so the app can open the right screen', () => {
    const msg = composeDaily('Rosario', reading(2.54), { cm: 6, hours: 24 }, NOW)!;

    expect(msg.data).toEqual({ screen: 'notifications' });
  });
});
