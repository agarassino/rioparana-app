import { describe, it, expect } from 'vitest';
import { hashToken, issueToken, parseBearer } from '../../src/auth/deviceToken.js';

describe('issueToken', () => {
  it('issues 256 random bits as 43 base64url characters', () => {
    const { token } = issueToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('never issues the same token twice', () => {
    const seen = new Set(Array.from({ length: 200 }, () => issueToken().token));
    expect(seen.size).toBe(200);
  });

  it('returns the hash of the token it returns, never the token itself', () => {
    const { token, hash } = issueToken();
    expect(hash).toBe(hashToken(token));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
  });
});

describe('hashToken', () => {
  it('returns the standard SHA-256 lower-case hex digest', () => {
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('parseBearer', () => {
  const token = 'a'.repeat(43);

  it('reads a well-formed header', () => {
    expect(parseBearer(`Bearer ${token}`)).toBe(token);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['lower-case scheme', `bearer ${token}`],
    ['two spaces', `Bearer  ${token}`],
    ['trailing space', `Bearer ${token} `],
    ['trailing newline', `Bearer ${token}\n`],
    ['trailing carriage return', `Bearer ${token}\r`],
    ['too short', 'Bearer abc'],
    ['too long', `Bearer ${token}a`],
    ['not base64url', `Bearer ${'+'.repeat(43)}`],
  ])('rejects %s', (_label, header) => {
    expect(parseBearer(header)).toBeNull();
  });

  it('uses the first value when the header is repeated', () => {
    expect(parseBearer([`Bearer ${token}`, 'Bearer other'])).toBe(token);
  });
});
