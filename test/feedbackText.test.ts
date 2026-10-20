// test/feedbackText.test.ts
import { describe, expect, test } from 'vitest';
import { canSend, countChars, FAILURE_COPY, isKind, osVersionLabel, STATUS_LABELS } from '../src/services/feedbackText';

describe('countChars', () => {
  test('counts an emoji as one character, like the server', () => {
    expect('😀'.length).toBe(2);
    expect(countChars('😀')).toBe(1);
  });
});

describe('canSend', () => {
  test('allows 2000 emoji and refuses 2001', () => {
    expect(canSend('😀'.repeat(2000))).toBe(true);
    expect(canSend('😀'.repeat(2001))).toBe(false);
  });

  test('ignores surrounding whitespace and refuses an empty message', () => {
    expect(canSend(`  ${'a'.repeat(2000)}  `)).toBe(true);
    expect(canSend(' \n ')).toBe(false);
  });

  test('refuses a NUL byte the database would reject', () => {
    expect(canSend('a\u0000b')).toBe(false);
  });
});

describe('osVersionLabel', () => {
  test('produces something the server accepts', () => {
    expect(osVersionLabel('android', 34)).toBe('android 34');
    expect(osVersionLabel('ios', '18.1')).toBe('ios 18.1');
    expect(osVersionLabel('weird<os>', '1/2')).toMatch(/^[A-Za-z0-9 ._-]{1,40}$/);
    expect(osVersionLabel('', '')).toBe('unknown');
  });
});

describe('labels', () => {
  test('cover every kind, status and failure', () => {
    expect(isKind('bug')).toBe(true);
    expect(isKind('rant')).toBe(false);
    expect(STATUS_LABELS).toEqual({ open: 'Enviado', answered: 'Respondido', archived: 'Cerrado' });
    expect(Object.keys(FAILURE_COPY).sort()).toEqual(['invalid', 'limit', 'not_found', 'offline', 'unavailable']);
  });
});
