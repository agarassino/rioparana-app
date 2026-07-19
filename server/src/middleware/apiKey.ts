import { FastifyReply, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function apiKeyGuard(expectedKey: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.url.split('?')[0] === '/health') return;
    const provided = request.headers['x-api-key'];
    const key = Array.isArray(provided) ? provided[0] : provided;
    if (!key || !safeEqual(key, expectedKey)) {
      reply.code(401).send({ error: 'unauthorized' });
    }
  };
}
