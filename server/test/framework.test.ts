import { describe, it, expect } from 'vitest';
import { buildServer } from '../src/server.js';

// The security review found client-IP spoofing (proxy-addr) and three high
// advisories in the Fastify 4 tree. This pins the major so a lockfile revert
// cannot silently bring them back.
describe('framework', () => {
  it('runs on Fastify 5 or later', async () => {
    const app = await buildServer();
    expect(Number(app.version.split('.')[0])).toBeGreaterThanOrEqual(5);
    await app.close();
  });
});
