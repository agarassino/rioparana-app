import { requireDevice } from '../auth/requireDevice.js';
import { getNotifications, savePushToken } from '../stores/pushStore.js';
import { pingDevice } from '../stores/deviceStore.js';

const mePushTokenBody = z.object({
  pushToken: z.string().regex(/^ExponentPushToken\[[^\]]+\]$/).nullable(),
});
const mePingBody = z.object({ stationId: z.string().min(1).max(64).optional() });

// server/src/routes/devices.ts
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { hashToken, issueToken, parseBearer } from '../auth/deviceToken.js';
import { registerDevice } from '../stores/deviceTokenStore.js';

export interface DeviceRouteDeps {
  pool: Pool;
}

/** Writes are limited per device, keyed on the token so one phone cannot spend everyone's budget. */
export function deviceRateKey(req: FastifyRequest): string {
  const token = parseBearer(req.headers.authorization);
  return token ? `device:${hashToken(token)}` : `ip:${req.ip}`;
}

export const DEVICE_WRITE_LIMIT = { max: 60, timeWindow: '1 minute', keyGenerator: deviceRateKey };

const registerBody = z.object({ deviceId: z.string().uuid() });

export function registerDeviceRoutes(app: FastifyInstance, deps: DeviceRouteDeps): void {
  const { pool } = deps;

  app.post(
    '/devices/register',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const parsed = registerBody.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid', field: 'deviceId' });

      const { token, hash } = issueToken();
      const result = await registerDevice(pool, parsed.data.deviceId, hash);
      if (result === 'already_registered') return reply.code(409).send({ error: 'already_registered' });
      return reply.code(201).send({ token });
    },
  );
  // The device comes from the token. A deviceId in the body or query is
  // ignored on purpose: that is exactly what the legacy routes trusted.
  const auth = requireDevice(pool);
  const write = { preHandler: auth, config: { rateLimit: DEVICE_WRITE_LIMIT } };

  app.get('/me/notifications', { preHandler: auth }, async (req) => getNotifications(pool, req.deviceId!));

  app.put('/me/push-token', write, async (req, reply) => {
    const parsed = mePushTokenBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid', field: 'pushToken' });
    await savePushToken(pool, req.deviceId!, parsed.data.pushToken);
    return reply.code(204).send();
  });

  app.post('/me/ping', write, async (req, reply) => {
    const parsed = mePingBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'invalid', field: 'stationId' });
    await pingDevice(pool, req.deviceId!, parsed.data.stationId);
    return reply.code(204).send();
  });
}
