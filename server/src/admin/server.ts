import { UUID } from '../routes/feedback.js';
// server/src/admin/server.ts
import Fastify, { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { safeEqual } from '../middleware/apiKey.js';
import { loggerOptions, type LoggerConfig } from '../logging.js';
import { BODY_LIMIT } from '../server.js';
import { createSessionStore, SESSION_TTL_MS, type AdminSession } from './sessions.js';
import { createLockout } from './lockout.js';
import { verifyPassword } from './password.js';
import { ADMIN_CSS, inboxPage, loginPage, notFoundPage, threadPage } from './views.js';
import { newMessageSchema, parseInput } from '../feedback/validation.js';
import { recordAudit } from '../stores/adminAudit.js';
import { archiveThread, getThreadForAdmin, INBOX_FILTERS, listInbox, replyAsAdmin, type InboxFilter } from '../stores/feedbackAdminStore.js';
import { notifyReply } from '../services/replyPush.js';

// The owner's admin: a second Fastify instance in the same process, on its own
// port, published by Docker only on the tailnet address. Nothing here is
// registered on the public instance.

export const SESSION_COOKIE = 'admin_session';
export const LOGIN_CSRF_COOKIE = 'admin_login_csrf';
const PUBLIC_PATHS = new Set(['/admin/login', '/admin/assets/admin.css']);

export interface AdminServerOptions {
  pool: Pool;
  passwordHash: string;
  /** True only when served over HTTPS (Traefik fallback). */
  secureCookie?: boolean;
  clock?: () => number;
  pushFetch?: typeof fetch;
  logger?: LoggerConfig;
}

declare module 'fastify' {
  interface FastifyRequest {
    adminSession: AdminSession | null;
  }
}

const randomToken = () => randomBytes(32).toString('base64url');

function formField(req: FastifyRequest, name: string): string | undefined {
  const value = (req.body as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' ? value : undefined;
}

function csrfMatches(req: FastifyRequest, expected: string): boolean {
  const got = formField(req, '_csrf');
  return got !== undefined && safeEqual(got, expected);
}

export async function buildAdminServer(opts: AdminServerOptions): Promise<FastifyInstance> {
  const clock = opts.clock ?? Date.now;
  const now = () => new Date(clock());
  const sessions = createSessionStore({ now: clock });
  const lockout = createLockout({ now: clock });

  const app = Fastify({ logger: opts.logger ? loggerOptions(opts.logger) : false, bodyLimit: BODY_LIMIT });
  await app.register(cookie);
  await app.register(formbody);
  app.decorateRequest('adminSession', null);

  const cookieOptions = (maxAgeSeconds: number) => ({
    httpOnly: true,
    sameSite: 'strict' as const,
    path: '/admin',
    secure: opts.secureCookie ?? false,
    maxAge: maxAgeSeconds,
  });
  const page = (reply: FastifyReply, code: number, body: string) =>
    reply.code(code).type('text/html; charset=utf-8').send(body);
  // Unknown, unauthorised and forged requests are indistinguishable.
  const notFound = (reply: FastifyReply) => page(reply, 404, notFoundPage());

  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('Content-Security-Policy', "default-src 'self'");
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cache-Control', 'no-store');
    return payload;
  });

  app.addHook('preHandler', async (req, reply) => {
    if (PUBLIC_PATHS.has(req.url.split('?')[0])) return;
    const session = sessions.get(req.cookies[SESSION_COOKIE]);
    if (!session) return notFound(reply);
    if (req.method === 'POST' && !csrfMatches(req, session.csrf)) return notFound(reply);
    req.adminSession = session;
  });

  app.setNotFoundHandler((_req, reply) => notFound(reply));
  app.setErrorHandler((err: FastifyError, req, reply) => {
    if ((err.statusCode ?? 500) < 500) return notFound(reply);
    req.log.error({ err }, 'admin request failed');
    return reply.code(500).type('application/json; charset=utf-8').send({ error: 'internal' });
  });

  app.get('/admin/assets/admin.css', async (_req, reply) =>
    reply.type('text/css; charset=utf-8').send(ADMIN_CSS));

  app.get('/admin/login', async (_req, reply) => {
    const csrf = randomToken();
    reply.setCookie(LOGIN_CSRF_COOKIE, csrf, cookieOptions(3600));
    return page(reply, 200, loginPage({ csrf }));
  });

  app.post('/admin/login', async (req, reply) => {
    const expected = req.cookies[LOGIN_CSRF_COOKIE];
    if (!expected || !csrfMatches(req, expected)) return notFound(reply);
    const at = now();

    const retry = (code: number, message: string) => {
      const csrf = randomToken();
      reply.setCookie(LOGIN_CSRF_COOKIE, csrf, cookieOptions(3600));
      return page(reply, code, loginPage({ csrf, message }));
    };

    if (lockout.isLocked()) {
      await recordAudit(opts.pool, 'login_failed', null, at);
      return retry(429, 'Demasiados intentos. Probá de nuevo en 15 minutos.');
    }
    if (!(await verifyPassword(opts.passwordHash, formField(req, 'password') ?? ''))) {
      lockout.recordFailure();
      await recordAudit(opts.pool, 'login_failed', null, at);
      return retry(401, 'Contraseña incorrecta.');
    }

    lockout.recordSuccess();
    const session = sessions.create();
    await recordAudit(opts.pool, 'login', null, at);
    reply.clearCookie(LOGIN_CSRF_COOKIE, { path: '/admin' });
    reply.setCookie(SESSION_COOKIE, session.id, cookieOptions(SESSION_TTL_MS / 1000));
    return reply.redirect('/admin', 303);
  });

  app.post('/admin/logout', async (req, reply) => {
    sessions.destroy(req.adminSession!.id);
    reply.clearCookie(SESSION_COOKIE, { path: '/admin' });
    return reply.redirect('/admin/login', 303);
  });

  app.get('/admin', async (req, reply) => {
    const requested = (req.query as { filter?: string }).filter;
    const filter: InboxFilter = INBOX_FILTERS.includes(requested as InboxFilter) ? (requested as InboxFilter) : 'pending';
    const rows = await listInbox(opts.pool, filter);
    return page(reply, 200, inboxPage({ filter, rows, csrf: req.adminSession!.csrf }));
  });

  return app;
}
