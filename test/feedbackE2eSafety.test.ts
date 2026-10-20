import { spawnSync } from 'node:child_process';
import { describe, expect, test } from 'vitest';
describe('feedback E2E safety gates', () => {
 test('admin helper refuses writes without explicit approval', () => {
  const result = spawnSync(process.execPath, ['scripts/e2e-admin-reply.mjs'], {
   env: { ...process.env, FEEDBACK_E2E_APPROVED: '', ADMIN_PASSWORD: 'fake', MARKER: 'probe', ADMIN_URL: 'http://127.0.0.1:1' }, encoding: 'utf8',
  });
  expect(result.status).toBe(1); expect(result.stderr).toContain('FEEDBACK_E2E_APPROVED=1');
 });
 test('orchestrator refuses app/server mutations without approval', () => {
  const result = spawnSync('bash', ['scripts/e2e-feedback.sh'], {
   env: { ...process.env, FEEDBACK_E2E_APPROVED: '', ADMIN_PASSWORD: 'fake' }, encoding: 'utf8',
  });
  expect(result.status).toBe(1); expect(result.stderr).toContain('FEEDBACK_E2E_APPROVED=1');
 });
});
