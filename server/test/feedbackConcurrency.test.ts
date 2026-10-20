import { prepareDatabase } from '../src/db/startup.js';
import { runOwnerEmailTick } from '../src/services/ownerEmail.js';
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import { disposablePostgres, postgresUnavailable } from './helpers/disposablePostgres.js';
import { runMigrations } from '../src/db/index.js';
import { buildServer } from '../src/server.js';
import { buildAdminServer } from '../src/admin/server.js';
import { registerDevice } from '../src/stores/deviceTokenStore.js';
import { createThread, addMessage } from '../src/stores/feedbackStore.js';
import { replyAsAdmin, archiveThread } from '../src/stores/feedbackAdminStore.js';
import { hashPassword } from '../src/admin/password.js';
import { session, postForm, PASSWORD } from './helpers/admin.js';
import { A, H, KEY, bearer, registerToken } from './helpers/devices.js';

const unavailable = postgresUnavailable();
if (unavailable) console.warn(`[real-postgres] SKIPPED: ${unavailable}`);
describe.skipIf(Boolean(unavailable))('disposable real PostgreSQL concurrency', () => {
  let db: Awaited<ReturnType<typeof disposablePostgres>>;
  let pool: Pool;
  const now = new Date('2026-10-17T12:00:00Z');
  const input = (body: string) => ({ deviceId: A, kind: 'bug' as const, body, stationId: 'rosario', appVersion: '2.2.0', osVersion: 'test' });
  beforeAll(async () => { db = await disposablePostgres(); pool = db.pool; await runMigrations(pool); }, 60_000);
  afterAll(async () => { if (db) await db.stop(); });
  beforeEach(async () => {
    await pool.query('DROP TRIGGER IF EXISTS test_slow_device ON feedback_messages');
    await pool.query('TRUNCATE devices, feedback_threads, feedback_messages, admin_audit, notifications, job_state CASCADE');
  });

  async function slowDeviceInserts() {
    await pool.query(`CREATE OR REPLACE FUNCTION test_slow_device() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.1); RETURN NEW; END $$`);
    await pool.query('CREATE TRIGGER test_slow_device BEFORE INSERT ON feedback_messages FOR EACH ROW EXECUTE FUNCTION test_slow_device()');
  }

  it('migrations rerun against actual PostgreSQL', async () => { await runMigrations(pool); });

  it('concurrent admin forms persist one reply/audit and send one push', async () => {
    await registerDevice(pool, A, 'hash', now);
    await pool.query('UPDATE devices SET push_token = $2 WHERE device_id = $1', [A, 'ExponentPushToken[test]']);
    const thread = await createThread(pool, input('first'), now);
    await pool.query(`CREATE OR REPLACE FUNCTION test_slow_admin() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.author = 'admin' THEN PERFORM pg_sleep(0.1); END IF; RETURN NEW; END $$`);
    await pool.query('CREATE TRIGGER test_slow_admin BEFORE INSERT ON feedback_messages FOR EACH ROW EXECUTE FUNCTION test_slow_admin()');
    const push = vi.fn(async () => new Response(JSON.stringify({ data: [{ status: 'ok' }] })));
    const app = await buildAdminServer({ pool, passwordHash: await hashPassword(PASSWORD), pushFetch: push as typeof fetch, clock: () => now.getTime() });
    try {
      const auth = await session(app);
      const results = await Promise.all(Array.from({ length: 8 }, () => postForm(app, `/admin/threads/${thread.id}/reply`, auth.cookie, { _csrf: auth.csrf, body: 'same reply' })));
      expect(results.map((r) => r.statusCode)).toEqual(Array(8).fill(303));
      expect((await pool.query("SELECT id FROM feedback_messages WHERE author = 'admin'")).rowCount).toBe(1);
      expect((await pool.query("SELECT id FROM admin_audit WHERE action = 'reply'")).rowCount).toBe(1);
      expect(push).toHaveBeenCalledTimes(1);
    } finally { await app.close(); await pool.query('DROP TRIGGER test_slow_admin ON feedback_messages'); await pool.query('DROP FUNCTION test_slow_admin()'); }
  });

  it('concurrent device retries create one thread and one follow-up message', async () => {
    const app = await buildServer({ pool, apiKey: KEY, now: () => now });
    try {
      const token = await registerToken(app, A);
      const post = () => app.inject({ method: 'POST', url: '/feedback', headers: bearer(token), payload: input('same thread') });
      const threads = await Promise.all(Array.from({ length: 8 }, post));
      expect(new Set(threads.map((r) => r.json().id)).size).toBe(1);
      expect(threads.filter((r) => r.statusCode === 201)).toHaveLength(1);
      const id = threads[0].json().id;
      const replies = await Promise.all(Array.from({ length: 8 }, () => app.inject({ method: 'POST', url: `/feedback/${id}/messages`, headers: bearer(token), payload: { body: 'same follow-up' } })));
      expect(new Set(replies.map((r) => r.json().id)).size).toBe(1);
      expect(replies.filter((r) => r.statusCode === 201)).toHaveLength(1);
      expect((await pool.query('SELECT id FROM feedback_messages')).rowCount).toBe(2);
    } finally { await app.close(); }
  });

  it('serializes the fifth-thread quota across simultaneous distinct posts', async () => {
    const app = await buildServer({ pool, apiKey: KEY, now: () => now });
    try {
      const token = await registerToken(app, A);
      for (let i = 0; i < 4; i++) await createThread(pool, input(`seed ${i}`), now);
      await slowDeviceInserts();
      const replies = await Promise.all(['last slot A', 'last slot B'].map((body) => app.inject({ method: 'POST', url: '/feedback', headers: bearer(token), payload: input(body) })));
      expect(replies.map((r) => r.statusCode).sort()).toEqual([201, 429]);
      expect((await pool.query('SELECT id FROM feedback_threads')).rowCount).toBe(5);
    } finally { await app.close(); }
  });

  it('serializes the thirtieth-message quota across different threads', async () => {
    const app = await buildServer({ pool, apiKey: KEY, now: () => now });
    try {
      const token = await registerToken(app, A);
      const first = await createThread(pool, input('first'), now);
      const second = await createThread(pool, input('second'), now);
      for (let i = 0; i < 27; i++) await addMessage(pool, first.id, 'device', `seed ${i}`, now);
      await slowDeviceInserts();
      const replies = await Promise.all([first, second].map((thread, i) => app.inject({ method: 'POST', url: `/feedback/${thread.id}/messages`, headers: bearer(token), payload: { body: `last ${i}` } })));
      expect(replies.map((r) => r.statusCode).sort()).toEqual([201, 429]);
      expect((await pool.query("SELECT id FROM feedback_messages WHERE author = 'device'")).rowCount).toBe(30);
    } finally { await app.close(); }
  });

  it('rolls back reply/status and archive when their audit insert fails', async () => {
    await registerDevice(pool, A, 'hash', now);
    const thread = await createThread(pool, input('first'), now);
    await pool.query("ALTER TABLE admin_audit ADD CONSTRAINT test_audit_failure CHECK (action = 'login')");
    try {
      await expect(replyAsAdmin(pool, thread.id, 'must roll back', now)).rejects.toThrow();
      expect((await pool.query("SELECT id FROM feedback_messages WHERE author = 'admin'")).rowCount).toBe(0);
      expect((await pool.query('SELECT status FROM feedback_threads WHERE id = $1', [thread.id])).rows[0].status).toBe('open');
      await expect(archiveThread(pool, thread.id, now)).rejects.toThrow();
      expect((await pool.query('SELECT status FROM feedback_threads WHERE id = $1', [thread.id])).rows[0].status).toBe('open');
    } finally { await pool.query('ALTER TABLE admin_audit DROP CONSTRAINT test_audit_failure'); }
  });
  it('restricted nonowner runtime starts without DDL and audit is append-only', async () => {
    await pool.query('CREATE ROLE feedback_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT');
    await pool.query('GRANT USAGE ON SCHEMA public TO feedback_runtime');
    await pool.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO feedback_runtime');
    await pool.query('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO feedback_runtime');
    await pool.query('REVOKE UPDATE, DELETE, TRUNCATE ON admin_audit FROM feedback_runtime');
    const client = await pool.connect();
    try {
      await client.query('SET ROLE feedback_runtime');
      await expect(prepareDatabase(client as unknown as Pool, false)).resolves.toBeUndefined();
      await client.query("INSERT INTO admin_audit (action, at) VALUES ('login', now())");
      expect((await client.query('SELECT action FROM admin_audit')).rows[0].action).toBe('login');
      for (const sql of ["UPDATE admin_audit SET action = 'x'", 'DELETE FROM admin_audit', 'TRUNCATE admin_audit', 'ALTER TABLE devices ADD COLUMN forbidden text']) {
        await expect(client.query(sql)).rejects.toThrow();
      }
    } finally { await client.query('RESET ROLE'); client.release(); }
  });

  it('email acknowledges a snapshot, not a late commit with the same or older timestamp', async () => {
    await registerDevice(pool, A, 'hash', now);
    await createThread(pool, input('selected'), now);
    const writer = await pool.connect();
    try {
      await writer.query('BEGIN');
      await createThread(writer, input('late commit'), new Date(now.getTime() - 1000));
      const cfg = { apiKey: 'test', to: 'owner@example.invalid', from: 'test@example.invalid', adminBaseUrl: 'http://localhost', fetchFn: (async () => {
        await writer.query('COMMIT');
        return new Response('{}', { status: 200 });
      }) as typeof fetch };
      expect(await runOwnerEmailTick(pool, cfg, now)).toEqual({ status: 'sent', messages: 1 });
      const next = { ...cfg, fetchFn: (async () => new Response('{}', { status: 200 })) as typeof fetch };
      expect(await runOwnerEmailTick(pool, next, new Date(now.getTime() + 16 * 60_000))).toEqual({ status: 'sent', messages: 1 });
      expect((await pool.query('SELECT id FROM feedback_messages WHERE owner_emailed_at IS NULL')).rowCount).toBe(0);
    } finally { await writer.query('ROLLBACK'); writer.release(); }
  });

  it('does not leave an empty thread when its first message insert fails', async () => {
    const app = await buildServer({ pool, apiKey: KEY, now: () => now });
    const token = await registerToken(app, A);
    await pool.query("ALTER TABLE feedback_messages ADD CONSTRAINT test_message_failure CHECK (body <> 'reject this')");
    try {
      const response = await app.inject({ method: 'POST', url: '/feedback', headers: bearer(token), payload: input('reject this') });
      expect(response.statusCode).toBe(500);
      expect((await pool.query('SELECT id FROM feedback_threads')).rowCount).toBe(0);
    } finally { await app.close(); await pool.query('ALTER TABLE feedback_messages DROP CONSTRAINT test_message_failure'); }
  });

  it('registration wins over a queued legacy write without a token bypass', async () => {
    const app = await buildServer({ pool, apiKey: KEY });
    await pool.query('INSERT INTO devices (device_id, first_seen, last_seen) VALUES ($1, $2, $2)', [A, now]);
    const blocker = await pool.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT device_id FROM devices WHERE device_id = $1 FOR UPDATE', [A]);
      const registered = registerDevice(pool, A, 'new-hash', now);
      let waiting = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const blocked = await pool.query("SELECT pid FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE 'UPDATE devices SET token_hash%'");
        if (blocked.rowCount) { waiting = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      const legacy = app.inject({ method: 'POST', url: '/devices/push-token', headers: H, payload: { deviceId: A, pushToken: 'ExponentPushToken[attacker]' } });
      await blocker.query('COMMIT');
      expect(await registered).toBe('issued');
      expect((await legacy).statusCode).toBe(401);
      expect((await pool.query('SELECT push_token FROM devices WHERE device_id = $1', [A])).rows[0].push_token).toBeNull();
    } finally { await blocker.query('ROLLBACK'); blocker.release(); await app.close(); }
  });

});
