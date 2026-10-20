// server/test/helpers/devices.ts
import type { FastifyInstance } from 'fastify';

export const KEY = 'secret';
export const H = { 'x-api-key': KEY };
export const A = '11111111-1111-4111-8111-111111111111';
export const B = '22222222-2222-4222-8222-222222222222';

export async function registerToken(app: FastifyInstance, deviceId: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/devices/register', headers: H, payload: { deviceId } });
  if (res.statusCode !== 201) throw new Error(`register failed: ${res.statusCode}`);
  return res.json().token as string;
}

export const bearer = (token: string) => ({ ...H, authorization: `Bearer ${token}` });
