// server/test/helpers/admin.ts
import type { FastifyInstance } from 'fastify';

export const PASSWORD = 'correct horse battery staple';

type Cookies = { cookies: Array<{ name: string; value: string }> };

export const cookieHeader = (res: Cookies, only?: string) =>
  res.cookies
    .filter((c) => c.value !== '' && (!only || c.name === only))
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

export function csrfFrom(page: string): string {
  const m = /name="_csrf" value="([^"]+)"/.exec(page);
  if (!m) throw new Error('no csrf field on page');
  return m[1];
}

export function postForm(app: FastifyInstance, url: string, cookie: string, fields: Record<string, string>) {
  return app.inject({
    method: 'POST', url,
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
    payload: new URLSearchParams(fields).toString(),
  });
}

export async function login(app: FastifyInstance, password = PASSWORD) {
  const page = await app.inject({ method: 'GET', url: '/admin/login' });
  return postForm(app, '/admin/login', cookieHeader(page), { password, _csrf: csrfFrom(page.body) });
}

export async function session(app: FastifyInstance): Promise<{ cookie: string; csrf: string }> {
  const res = await login(app);
  if (res.statusCode !== 303) throw new Error(`login failed: ${res.statusCode}`);
  const cookie = cookieHeader(res, 'admin_session');
  const inbox = await app.inject({ method: 'GET', url: '/admin', headers: { cookie } });
  return { cookie, csrf: csrfFrom(inbox.body) };
}
