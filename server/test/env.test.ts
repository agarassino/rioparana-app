import { describe, it, expect } from 'vitest';
import { loadEnv } from '../src/config/env.js';

describe('loadEnv', () => {
  it('parses valid env', () => {
    const env = loadEnv({ PORT: '4000', DATABASE_URL: 'postgres://x', APP_API_KEY: 'secret' });
    expect(env).toEqual({ port: 4000, databaseUrl: 'postgres://x', apiKey: 'secret' });
  });

  it('defaults port to 3000', () => {
    const env = loadEnv({ DATABASE_URL: 'postgres://x', APP_API_KEY: 'secret' });
    expect(env.port).toBe(3000);
  });

  it('throws when DATABASE_URL missing', () => {
    expect(() => loadEnv({ APP_API_KEY: 'secret' })).toThrow();
  });
});
