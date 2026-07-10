import { z } from 'zod';

const schema = z.object({
  PORT: z.string().regex(/^\d+$/).optional(),
  DATABASE_URL: z.string().min(1),
  APP_API_KEY: z.string().min(1),
});

export interface Env {
  port: number;
  databaseUrl: string;
  apiKey: string;
}

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.parse(source);
  return {
    port: parsed.PORT ? Number(parsed.PORT) : 3000,
    databaseUrl: parsed.DATABASE_URL,
    apiKey: parsed.APP_API_KEY,
  };
}
