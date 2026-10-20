import { describe, it, expect, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { memPool } from '../helpers/memPool.js';
import { pingDevice } from '../../src/stores/deviceStore.js';
import { deviceForTokenHash, registerDevice } from '../../src/stores/deviceTokenStore.js';

const A = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-10-13T12:00:00.000Z');
let pool: Pool;

beforeEach(async () => {
  pool = await memPool();
});

describe('registerDevice', () => {
  it('issues a token for a device it has never seen', async () => {
    expect(await registerDevice(pool, A, 'h1', NOW)).toBe('issued');
    expect(await deviceForTokenHash(pool, 'h1')).toBe(A);
  });

  it('issues a token for a device that pinged before it had one', async () => {
    // Every install upgrading from 2.1.x already has a row with no token.
    await pingDevice(pool, A, 'rosario', NOW);
    expect(await registerDevice(pool, A, 'h1', NOW)).toBe('issued');
  });

  it('refuses to re-register a device that already holds a token', async () => {
    await registerDevice(pool, A, 'h1', NOW);

    expect(await registerDevice(pool, A, 'h2', NOW)).toBe('already_registered');
    expect(await deviceForTokenHash(pool, 'h1')).toBe(A);
    expect(await deviceForTokenHash(pool, 'h2')).toBeNull();
  });
});

describe('deviceForTokenHash', () => {
  it('returns null for an unknown hash', async () => {
    expect(await deviceForTokenHash(pool, 'nope')).toBeNull();
  });
});
