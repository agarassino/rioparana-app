// server/src/feedback/validation.ts
import { z } from 'zod';
import { getStationById } from '../config/stations.js';

// The body is counted in code points, as Postgres char_length does. zod's
// .max() counts UTF-16 units and would refuse 1001 emoji as "too long".
export const MAX_BODY_CHARS = 2000;

export function codePoints(s: string): number {
  return [...s].length;
}

const body = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => s.length > 0, 'empty')
  .refine((s) => codePoints(s) <= MAX_BODY_CHARS, 'too_long')
  // Postgres text cannot hold NUL; letting it through would be a 500.
  .refine((s) => !s.includes('\u0000'), 'nul');

export const newThreadSchema = z.object({
  kind: z.enum(['suggestion', 'bug', 'question']),
  body,
  stationId: z.string().max(64).refine((id) => Boolean(getStationById(id)), 'unknown_station').optional(),
  appVersion: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}$/),
  osVersion: z.string().regex(/^[A-Za-z0-9 ._-]{1,40}$/),
});

export const newMessageSchema = z.object({ body });

export type ParseResult<T> = { ok: true; data: T } | { ok: false; field: string };

/** The first offending field's name, never its value. */
export function parseInput<S extends z.ZodTypeAny>(schema: S, input: unknown): ParseResult<z.output<S>> {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  const path = result.error.issues[0]?.path[0];
  return { ok: false, field: typeof path === 'string' ? path : 'body' };
}
