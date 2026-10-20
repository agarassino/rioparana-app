// server/src/admin/sessions.ts
import { randomBytes } from 'node:crypto';

// Server-side sessions for the single owner. In memory on purpose: one
// process, one person, and a restart that logs them out costs nothing.
export const SESSION_TTL_MS = 12 * 3600_000;

export interface AdminSession {
  id: string;
  csrf: string;
  expiresAt: number;
}

export interface SessionStore {
  create(): AdminSession;
  get(id: string | undefined): AdminSession | null;
  destroy(id: string | undefined): void;
}

const token = () => randomBytes(32).toString('base64url');

export function createSessionStore(opts: { now?: () => number; ttlMs?: number } = {}): SessionStore {
  const now = opts.now ?? Date.now;
  const ttl = opts.ttlMs ?? SESSION_TTL_MS;
  const sessions = new Map<string, AdminSession>();

  return {
    create() {
      for (const [id, s] of sessions) if (s.expiresAt <= now()) sessions.delete(id);
      const session = { id: token(), csrf: token(), expiresAt: now() + ttl };
      sessions.set(session.id, session);
      return session;
    },
    get(id) {
      if (!id) return null;
      const session = sessions.get(id);
      if (!session) return null;
      if (session.expiresAt <= now()) {
        sessions.delete(id);
        return null;
      }
      return session;
    },
    destroy(id) {
      if (id) sessions.delete(id);
    },
  };
}
