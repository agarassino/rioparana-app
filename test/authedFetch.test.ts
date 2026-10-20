// test/authedFetch.test.ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ ensure: vi.fn(), clear: vi.fn(async () => {}) }));
vi.mock('../src/services/deviceToken', () => ({
  ensureDeviceToken: mocks.ensure,
  clearDeviceToken: mocks.clear,
}));

import { authedFetch } from '../src/services/api/authedFetch';

const TOKEN = 'a'.repeat(43);
const TOKEN2 = 'b'.repeat(43);
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const headersOf = (f: ReturnType<typeof vi.fn>, call: number) =>
  (f.mock.calls[call][1] as RequestInit).headers as Record<string, string>;

beforeEach(() => { mocks.ensure.mockReset(); mocks.clear.mockClear(); });
afterEach(() => vi.unstubAllGlobals());

describe('authedFetch', () => {
  test('sends the api key, the bearer token and a JSON body', async () => {
    mocks.ensure.mockResolvedValue(TOKEN);
    const fetchMock = vi.fn(async () => json(201, {}));
    vi.stubGlobal('fetch', fetchMock);

    const res = await authedFetch('/feedback', { method: 'POST', body: { a: 1 } });

    expect(res?.status).toBe(201);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/feedback$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ a: 1 });
    expect(headersOf(fetchMock, 0)).toMatchObject({ Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' });
    expect(headersOf(fetchMock, 0)).toHaveProperty('x-api-key');
  });

  test('returns null without calling the API when there is no token', async () => {
    mocks.ensure.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await authedFetch('/me/ping', { method: 'POST', body: {} })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('returns null rather than throwing when offline', async () => {
    mocks.ensure.mockResolvedValue(TOKEN);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Network request failed'); }));

    expect(await authedFetch('/feedback')).toBeNull();
  });

  test('re-registers once and retries when the server no longer knows the token', async () => {
    mocks.ensure.mockResolvedValueOnce(TOKEN).mockResolvedValueOnce(TOKEN2);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(401, { error: 'invalid_token' }))
      .mockResolvedValueOnce(json(200, []));
    vi.stubGlobal('fetch', fetchMock);

    const res = await authedFetch('/feedback');

    expect(res?.status).toBe(200);
    expect(mocks.clear).toHaveBeenCalledTimes(1);
    expect(headersOf(fetchMock, 1).Authorization).toBe(`Bearer ${TOKEN2}`);
  });

  test('does not loop when the fresh token is refused too', async () => {
    mocks.ensure.mockResolvedValue(TOKEN);
    const fetchMock = vi.fn(async () => json(401, { error: 'invalid_token' }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await authedFetch('/feedback')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('keeps the token when the 401 is about the api key', async () => {
    mocks.ensure.mockResolvedValue(TOKEN);
    const fetchMock = vi.fn(async () => json(401, { error: 'unauthorized' }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await authedFetch('/feedback');

    expect(res?.status).toBe(401);
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
