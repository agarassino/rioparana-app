// server/test/admin/password.test.ts
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/admin/password.js';

describe('password', () => {
  it('hashes with argon2id and verifies only the right password', async () => {
    const stored = await hashPassword('correct horse battery staple');
    expect(stored.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(stored, 'correct horse battery staple')).toBe(true);
    expect(await verifyPassword(stored, 'wrong')).toBe(false);
  });

  it('answers false, not an exception, for a corrupt stored hash', async () => {
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
  });
});
