import { createHash, randomBytes } from 'node:crypto';

// The device credential. It is returned once and only its hash is stored, so
// a database leak does not hand out working tokens.

const BEARER = /^Bearer ([A-Za-z0-9_-]{43})$/;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function issueToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

/** The token in an `Authorization: Bearer …` header, or null for anything else. */
export function parseBearer(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return null;
  const match = BEARER.exec(value);
  return match ? match[1] : null;
}
