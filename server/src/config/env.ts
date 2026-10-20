import { z } from 'zod';

const schema = z.object({
  PORT: z.string().regex(/^\d+$/).optional(),
  DATABASE_URL: z.string().min(1),
  APP_API_KEY: z.string().min(1),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
});

export interface Env {
  port: number;
  databaseUrl: string;
  apiKey: string;
  logLevel: string;
}

// Coolify can leave a variable defined but empty; that means "unset".
function present(source: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1] !== ''),
  );
}

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.parse(present(source));
  return {
    port: parsed.PORT ? Number(parsed.PORT) : 3000,
    databaseUrl: parsed.DATABASE_URL,
    apiKey: parsed.APP_API_KEY,
    logLevel: parsed.LOG_LEVEL ?? 'info',
  };
}
