import { FastifyReply, FastifyRequest } from 'fastify';

export function apiKeyGuard(expectedKey: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.url === '/health') return;
    if (request.headers['x-api-key'] !== expectedKey) {
      reply.code(401).send({ error: 'unauthorized' });
    }
  };
}
