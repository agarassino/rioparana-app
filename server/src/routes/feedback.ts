import { withTransaction } from '../db/transaction.js';
// server/src/routes/feedback.ts
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { requireDevice } from '../auth/requireDevice.js';
import { DEVICE_WRITE_LIMIT } from './devices.js';
import { newMessageSchema, newThreadSchema, parseInput } from '../feedback/validation.js';
import {
  addMessage, createThread, deviceActivitySince, findDuplicateMessage, findDuplicateThread,
  getThreadForDevice, listThreadsForDevice, ownsThread,
} from '../stores/feedbackStore.js';

export const FEEDBACK_LIMITS = { threadsPerDay: 5, messagesPerDay: 30 } as const;
const DAY_MS = 24 * 3600_000;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface FeedbackRouteDeps {
  pool: Pool;
  now?: () => Date;
}

export function registerFeedbackRoutes(app: FastifyInstance, deps: FeedbackRouteDeps): void {
  const { pool } = deps;
  const now = deps.now ?? (() => new Date());
  const auth = requireDevice(pool);
  const write = { preHandler: auth, config: { rateLimit: DEVICE_WRITE_LIMIT } };
  const notFound = { error: 'not_found' };

  app.post('/feedback', write, async (req, reply) => {
    const parsed = parseInput(newThreadSchema, req.body);
    if (!parsed.ok) return reply.code(400).send({ error: 'invalid', field: parsed.field });
    return withTransaction(pool, async (client) => {
      const deviceId = req.deviceId!;
      await client.query('SELECT device_id FROM devices WHERE device_id = $1 FOR UPDATE', [deviceId]);
      const at = now();
      const input = parsed.data;

      // A retry whose first attempt landed is answered with what already exists,
      // before the limit check, so a lost response cannot read as "limit reached".
      const duplicate = await findDuplicateThread(client, deviceId, input.kind, input.body, at);
      if (duplicate) return { status: 200, body: duplicate };

      const used = await deviceActivitySince(client, deviceId, new Date(at.getTime() - DAY_MS));
      if (used.threads >= FEEDBACK_LIMITS.threadsPerDay) return { status: 429, body: { error: 'limit', limit: 'threads' } };
      if (used.messages >= FEEDBACK_LIMITS.messagesPerDay) return { status: 429, body: { error: 'limit', limit: 'messages' } };

      const thread = await createThread(client, { deviceId, ...input, stationId: input.stationId ?? null }, at);
      return { status: 201, body: thread };
    }).then(({ status, body }) => reply.code(status).send(body));
  });

  app.get('/feedback', { preHandler: auth }, async (req) => listThreadsForDevice(pool, req.deviceId!));

  app.get('/feedback/:id', { preHandler: auth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!UUID.test(id)) return reply.code(404).send(notFound);
    const thread = await getThreadForDevice(pool, req.deviceId!, id, { markRead: true });
    if (!thread) return reply.code(404).send(notFound);
    return thread;
  });

  app.post('/feedback/:id/messages', write, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!UUID.test(id)) return reply.code(404).send(notFound);
    return withTransaction(pool, async (client) => {
      const deviceId = req.deviceId!;
      await client.query('SELECT device_id FROM devices WHERE device_id = $1 FOR UPDATE', [deviceId]);
      await client.query('SELECT id FROM feedback_threads WHERE id = $1 AND device_id = $2 FOR UPDATE', [id, deviceId]);
      // Same 404 as a thread that does not exist: whether someone else's id is
      // real is itself information.
      if (!(await ownsThread(client, deviceId, id))) return { status: 404, body: notFound };

      const parsed = parseInput(newMessageSchema, req.body);
      if (!parsed.ok) return { status: 400, body: { error: 'invalid', field: parsed.field } };
      const at = now();

      const duplicate = await findDuplicateMessage(client, id, 'device', parsed.data.body, at);
      if (duplicate) return { status: 200, body: duplicate };

      const used = await deviceActivitySince(client, deviceId, new Date(at.getTime() - DAY_MS));
      if (used.messages >= FEEDBACK_LIMITS.messagesPerDay) return { status: 429, body: { error: 'limit', limit: 'messages' } };

      const message = await addMessage(client, id, 'device', parsed.data.body, at);
      return { status: 201, body: message };
    }).then(({ status, body }) => reply.code(status).send(body));
  });
}
