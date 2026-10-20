// scripts/e2e-admin-reply.mjs
// Plays the owner: logs into the tailnet admin, finds the thread carrying
// MARKER, replies, then archives it so e2e runs do not pile up in the inbox.
// Needs ADMIN_PASSWORD and MARKER; ADMIN_URL defaults to the tailnet address.
if (process.env.FEEDBACK_E2E_APPROVED !== '1') {
  console.error('Explicit owner approval required: FEEDBACK_E2E_APPROVED=1');
  process.exit(1);
}
const base = process.env.ADMIN_URL;
const password = process.env.ADMIN_PASSWORD;
const marker = process.env.MARKER;
if (!base || !password || !marker || !/^[A-Za-z0-9_-]{1,64}$/.test(marker)) {
  console.error('ADMIN_URL, ADMIN_PASSWORD and a safe MARKER are required');
  process.exit(1);
}
const target = new URL(base);
if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.pathname !== '/') {
  throw new Error('ADMIN_URL must be an http(s) origin without credentials');
}

const jar = new Map();
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
function remember(res) {
  for (const raw of res.headers.getSetCookie()) {
    const [pair] = raw.split(';');
    const i = pair.indexOf('=');
    const name = pair.slice(0, i);
    const value = pair.slice(i + 1);
    if (value) jar.set(name, value);
    else jar.delete(name);
  }
}
const csrf = (html) => {
  const m = /name="_csrf" value="([^"]+)"/.exec(html);
  if (!m) throw new Error('no csrf field');
  return m[1];
};

async function get(path) {
  const res = await fetch(base + path, { headers: { cookie: cookie() }, signal: AbortSignal.timeout(10_000), redirect: 'manual' });
  remember(res);
  if (res.status !== 200) throw new Error(`GET ${path} → ${res.status}`);
  return res.text();
}

async function post(path, fields) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { cookie: cookie(), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
    signal: AbortSignal.timeout(10_000), redirect: 'manual',
  });
  remember(res);
  if (res.status !== 303) throw new Error(`POST ${path} → ${res.status}`);
}

await post('/admin/login', { password, _csrf: csrf(await get('/admin/login')) });

let threadId;
for (let attempt = 0; attempt < 12 && !threadId; attempt++) {
  const inbox = await get('/admin?filter=pending');
  const item = inbox.split('<li>').find((chunk) => chunk.includes(`e2e ${marker}`));
  threadId = item && /href="\/admin\/threads\/([0-9a-f-]{36})"/.exec(item)?.[1];
  if (!threadId) await new Promise((r) => setTimeout(r, 5000));
}
if (!threadId) throw new Error(`no pending thread with marker ${marker}`);

await post(`/admin/threads/${threadId}/reply`, { _csrf: csrf(await get(`/admin/threads/${threadId}`)), body: `e2e-reply ${marker}` });
await post(`/admin/threads/${threadId}/archive`, { _csrf: csrf(await get(`/admin/threads/${threadId}`)) });
console.log(`replied to and archived ${threadId}`);
