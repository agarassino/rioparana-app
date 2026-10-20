// One logger configuration for both Fastify instances. Credentials are
// redacted by path so a future `req.log.info({ req })` cannot leak them.
export interface LoggerConfig {
  level?: string;
  stream?: { write(msg: string): void };
}

export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers["x-api-key"]',
  'req.headers["x-refresh-token"]',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'token',
  'password',
  'pushToken',
  '*.token',
  '*.password',
  '*.pushToken',
];

export function loggerOptions(cfg: LoggerConfig) {
  return {
    level: cfg.level ?? 'info',
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    ...(cfg.stream ? { stream: cfg.stream } : {}),
  };
}
