import { z } from 'zod';

const schema = z.object({
  RUN_MIGRATIONS: z.enum(['true', 'false']).optional(),
  ADMIN_PASSWORD_HASH: z.string().optional(),
  ADMIN_PORT: z.string().regex(/^\d+$/).optional(),
  ADMIN_SECURE_COOKIE: z.enum(['true', 'false']).optional(),

  RESEND_API_KEY: z.string().optional(),
  FEEDBACK_NOTIFY_EMAIL: z.string().optional(),
  FEEDBACK_FROM_EMAIL: z.string().optional(),
  ADMIN_BASE_URL: z.string().optional(),

  LEGACY_DEVICE_ROUTES: z.enum(['on', 'off']).optional(),
  PORT: z.string().regex(/^\d+$/).optional(),
  DATABASE_URL: z.string().min(1),
  APP_API_KEY: z.string().min(1),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
});

export interface Env {
  runMigrations: boolean;
  /** Null disables the admin listener; a malformed value is treated as missing. */
  adminPasswordHash: string | null;
  adminPort: number;
  adminSecureCookie: boolean;

  resendApiKey: string | null;
  feedbackNotifyEmail: string;
  feedbackFromEmail: string;
  /** Where the admin is reached, used for links in the owner email. */
  adminBaseUrl: string;

  legacyDeviceRoutes: boolean;
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
    runMigrations: parsed.RUN_MIGRATIONS !== 'false',
    adminPasswordHash: parsed.ADMIN_PASSWORD_HASH?.startsWith('$argon2id$') ? parsed.ADMIN_PASSWORD_HASH : null,
    adminPort: parsed.ADMIN_PORT ? Number(parsed.ADMIN_PORT) : 3100,
    adminSecureCookie: parsed.ADMIN_SECURE_COOKIE === 'true',

    resendApiKey: parsed.RESEND_API_KEY ?? null,
    feedbackNotifyEmail: parsed.FEEDBACK_NOTIFY_EMAIL ?? 'garassino@gmail.com',
    feedbackFromEmail: parsed.FEEDBACK_FROM_EMAIL ?? 'Paraná Info <avisos@rioparana.com.ar>',
    adminBaseUrl: (parsed.ADMIN_BASE_URL ?? 'http://100.89.213.31:3100').replace(/\/$/, ''),

    legacyDeviceRoutes: parsed.LEGACY_DEVICE_ROUTES !== 'off',
    port: parsed.PORT ? Number(parsed.PORT) : 3000,
    databaseUrl: parsed.DATABASE_URL,
    apiKey: parsed.APP_API_KEY,
    logLevel: parsed.LOG_LEVEL ?? 'info',
  };
}
