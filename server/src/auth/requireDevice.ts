// server/src/auth/requireDevice.ts
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { hashToken, parseBearer } from './deviceToken.js';
import { deviceForTokenHash } from '../stores/deviceTokenStore.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by requireDevice from the bearer token; never from the body or query. */
    deviceId: string | null;
  }
}

// 'invalid_token' rather than the api key's 'unauthorized': the app drops and
// re-registers its token on this answer, and must not do that when the
// problem is the key baked into its bundle.
export function requireDevice(pool: Pool) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const token = parseBearer(req.headers.authorization);
    const deviceId = token ? await deviceForTokenHash(pool, hashToken(token)) : null;
    if (!deviceId) return reply.code(401).send({ error: 'invalid_token' });
    req.deviceId = deviceId;
  };
}
