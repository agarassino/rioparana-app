import { describe, it, expect } from 'vitest';
import { loadEnv } from '../src/config/env.js';

describe('loadEnv', () => {
  it('parses valid env', () => {
    const env = loadEnv({ PORT: '4000', DATABASE_URL: 'postgres://x', APP_API_KEY: 'secret' });
    expect(env).toMatchObject({ port: 4000, databaseUrl: 'postgres://x', apiKey: 'secret' });
  });

  it('defaults the log level to info and treats empty strings as unset', () => {
    const env = loadEnv({ DATABASE_URL: 'postgres://x', APP_API_KEY: 'secret', LOG_LEVEL: '' });
    expect(env.logLevel).toBe('info');
  });

  it('defaults port to 3000', () => {
    const env = loadEnv({ DATABASE_URL: 'postgres://x', APP_API_KEY: 'secret' });
    expect(env.port).toBe(3000);
  });

  it('throws when DATABASE_URL missing', () => {
    expect(() => loadEnv({ APP_API_KEY: 'secret' })).toThrow();
  });
});

  it('keeps the legacy device routes on unless told otherwise', () => {
    expect(loadEnv({ DATABASE_URL: 'x', APP_API_KEY: 'k' }).legacyDeviceRoutes).toBe(true);
    expect(loadEnv({ DATABASE_URL: 'x', APP_API_KEY: 'k', LEGACY_DEVICE_ROUTES: 'off' }).legacyDeviceRoutes).toBe(false);
  });

  it('defaults the feedback email settings and disables email without a key', () => {
    const env = loadEnv({ DATABASE_URL: 'x', APP_API_KEY: 'k' });
    expect(env).toMatchObject({
      resendApiKey: null,
      feedbackNotifyEmail: 'garassino@gmail.com',
      feedbackFromEmail: 'Paraná Info <avisos@rioparana.com.ar>',
      adminBaseUrl: 'http://100.89.213.31:3100',
    });
  });

  it('reads the Resend key and overrides', () => {
    const env = loadEnv({ DATABASE_URL: 'x', APP_API_KEY: 'k', RESEND_API_KEY: 're_1', FEEDBACK_NOTIFY_EMAIL: 'o@x.ar' });
    expect(env.resendApiKey).toBe('re_1');
    expect(env.feedbackNotifyEmail).toBe('o@x.ar');
  });

  it('defaults the admin to port 3100, plain cookies, and disabled without a hash', () => {
    expect(loadEnv({ DATABASE_URL: 'x', APP_API_KEY: 'k' })).toMatchObject({
      adminPasswordHash: null, adminPort: 3100, adminSecureCookie: false,
    });
  });

  it('disables the admin rather than crashing when the hash is not argon2id', () => {
    // Docker compose interpolation can eat the `$` segments of a hash pasted
    // without "Is Literal"; the API must still boot.
    expect(loadEnv({ DATABASE_URL: 'x', APP_API_KEY: 'k', ADMIN_PASSWORD_HASH: 'argon2id=19' }).adminPasswordHash).toBeNull();
    expect(loadEnv({ DATABASE_URL: 'x', APP_API_KEY: 'k', ADMIN_PASSWORD_HASH: '$argon2id$v=19$m=19456,t=2,p=1$abc$def' }).adminPasswordHash)
      .toBe('$argon2id$v=19$m=19456,t=2,p=1$abc$def');
  });

it('keeps startup migration backward-compatible but supports restricted runtime', () => {
  expect(loadEnv({ DATABASE_URL: 'x', APP_API_KEY: 'k' }).runMigrations).toBe(true);
  expect(loadEnv({ DATABASE_URL: 'x', APP_API_KEY: 'k', RUN_MIGRATIONS: 'false' }).runMigrations).toBe(false);
  expect(() => loadEnv({ DATABASE_URL: 'x', APP_API_KEY: 'k', RUN_MIGRATIONS: 'maybe' })).toThrow();
});
