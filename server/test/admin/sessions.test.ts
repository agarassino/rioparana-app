// server/test/admin/sessions.test.ts
import { describe, it, expect } from 'vitest';
import { createSessionStore, SESSION_TTL_MS } from '../../src/admin/sessions.js';

describe('createSessionStore', () => {
  it('issues unguessable, distinct session ids and csrf tokens', () => {
    const store = createSessionStore();
    const a = store.create();
    const b = store.create();
    expect(a.id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.csrf).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Set([a.id, a.csrf, b.id, b.csrf]).size).toBe(4);
  });

  it('keeps a session for 12 hours and not a millisecond more', () => {
    let t = 0;
    const store = createSessionStore({ now: () => t });
    const s = store.create();

    t = SESSION_TTL_MS - 1;
    expect(store.get(s.id)).toEqual(s);
    t = SESSION_TTL_MS;
    expect(store.get(s.id)).toBeNull();
    expect(SESSION_TTL_MS).toBe(12 * 3600_000);
  });

  it('forgets a session on logout', () => {
    const store = createSessionStore();
    const s = store.create();
    store.destroy(s.id);
    expect(store.get(s.id)).toBeNull();
  });

  it('returns null for a missing or unknown id', () => {
    const store = createSessionStore();
    expect(store.get(undefined)).toBeNull();
    expect(store.get('nope')).toBeNull();
  });
});
