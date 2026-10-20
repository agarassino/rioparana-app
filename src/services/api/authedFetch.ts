// src/services/api/authedFetch.ts
import { clearDeviceToken, ensureDeviceToken } from '../deviceToken';
import { API_BASE_URL, API_KEY, REQUEST_TIMEOUT_MS, withTimeout } from './http';

// Device-scoped calls carry the public api key AND this device's token. The
// server says 'invalid_token' when it no longer knows the token (its device
// row was removed); that, and only that, is worth one fresh registration.

async function isInvalidToken(res: Response): Promise<boolean> {
  if (res.status !== 401) return false;
  try {
    const body = (await res.clone().json()) as { error?: unknown };
    return body.error === 'invalid_token';
  } catch {
    return false;
  }
}

export async function authedFetch(
  path: string,
  init: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown } = {},
): Promise<Response | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await ensureDeviceToken();
    if (!token) return null;

    const timeout = withTimeout(REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${API_BASE_URL}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          'x-api-key': API_KEY,
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: timeout.signal,
      });
    } catch {
      return null;
    } finally {
      timeout.clear();
    }

    if (!(await isInvalidToken(res))) return res;
    await clearDeviceToken(token);
  }
  return null;
}
