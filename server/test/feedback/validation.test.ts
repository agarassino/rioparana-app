// server/test/feedback/validation.test.ts
import { describe, it, expect } from 'vitest';
import { newMessageSchema, newThreadSchema, parseInput } from '../../src/feedback/validation.js';

const valid = { kind: 'bug', body: 'Hola', stationId: 'rosario', appVersion: '2.2.0', osVersion: 'android 34' };

describe('newThreadSchema', () => {
  it('accepts a complete thread and trims the body', () => {
    expect(parseInput(newThreadSchema, { ...valid, body: '  Hola  ' })).toEqual({ ok: true, data: { ...valid, body: 'Hola' } });
  });

  it('accepts a thread without a station', () => {
    const { stationId: _s, ...rest } = valid;
    expect(parseInput(newThreadSchema, rest).ok).toBe(true);
  });

  it('counts code points: 2000 emoji fit even though they are 4000 UTF-16 units', () => {
    const body = '😀'.repeat(2000);
    expect(body.length).toBe(4000);
    expect(parseInput(newThreadSchema, { ...valid, body }).ok).toBe(true);
  });

  it.each([
    ['2001 code points', { body: 'a'.repeat(2001) }, 'body'],
    ['whitespace only', { body: ' \n\t ' }, 'body'],
    ['a NUL byte', { body: 'a\u0000b' }, 'body'],
    ['a number body', { body: 42 }, 'body'],
    ['an unknown kind', { kind: 'rant' }, 'kind'],
    ['an unknown station', { stationId: 'atlantis' }, 'stationId'],
    ['markup as version', { appVersion: '<script>' }, 'appVersion'],
    ['markup as os', { osVersion: '<b>x</b>' }, 'osVersion'],
  ])('rejects %s and names the field', (_label, over, field) => {
    expect(parseInput(newThreadSchema, { ...valid, ...over })).toEqual({ ok: false, field });
  });

  it('names body when the payload is not an object', () => {
    expect(parseInput(newThreadSchema, null)).toEqual({ ok: false, field: 'body' });
  });
});

describe('newMessageSchema', () => {
  it('applies the same body rules', () => {
    expect(parseInput(newMessageSchema, { body: ' ok ' })).toEqual({ ok: true, data: { body: 'ok' } });
    expect(parseInput(newMessageSchema, { body: '' })).toEqual({ ok: false, field: 'body' });
  });
});
