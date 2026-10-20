// test/deviceToken.test.ts
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (k: string) => store.get(k) ?? null),
  setItemAsync: vi.fn(async (k: string, v: string) => { store.set(k, v); }),
  deleteItemAsync: vi.fn(async (k: string) => { store.delete(k); }),
}));

const TOKEN = 'a'.repeat(43);
const TOKEN_KEY = 'parana-info.device-token';
const ID_KEY = 'parana-info.device-id';
const created = (token: string) => new Response(JSON.stringify({ token }), { status: 201 });
const taken = () => new Response(JSON.stringify({ error: 'already_registered' }), { status: 409 });
const sentId = (f: ReturnType<typeof vi.fn>, call: number) => JSON.parse(String(f.mock.calls[call][1].body)).deviceId;

async function load() {
  vi.resetModules();
  return import('../src/services/deviceToken');
}

beforeEach(() => store.clear());
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('ensureDeviceToken', () => {
  test('registers this device once and keeps the token in SecureStore', async () => {
    const fetchMock = vi.fn(async () => created(TOKEN));
    vi.stubGlobal('fetch', fetchMock);
    const { ensureDeviceToken } = await load();

    expect(await ensureDeviceToken()).toBe(TOKEN);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/devices\/register$/);
    expect(init.method).toBe('POST');
    expect(sentId(fetchMock, 0)).toBe(store.get(ID_KEY));
    expect(store.get(TOKEN_KEY)).toBe(TOKEN);
  });

  test('uses the stored token without touching the network', async () => {
    store.set(TOKEN_KEY, TOKEN);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { ensureDeviceToken } = await load();

    expect(await ensureDeviceToken()).toBe(TOKEN);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('shares one registration between concurrent callers', async () => {
    const fetchMock = vi.fn(async () => created(TOKEN));
    vi.stubGlobal('fetch', fetchMock);
    const { ensureDeviceToken } = await load();

    expect(await Promise.all([ensureDeviceToken(), ensureDeviceToken(), ensureDeviceToken()])).toEqual([TOKEN, TOKEN, TOKEN]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('starts over under a new device id when the server refuses the old one', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(taken()).mockResolvedValueOnce(created(TOKEN));
    vi.stubGlobal('fetch', fetchMock);
    const { ensureDeviceToken } = await load();

    expect(await ensureDeviceToken()).toBe(TOKEN);
    expect(sentId(fetchMock, 1)).not.toBe(sentId(fetchMock, 0));
    expect(store.get(ID_KEY)).toBe(sentId(fetchMock, 1));
  });

  test('gives up after a second refusal instead of looping', async () => {
    const fetchMock = vi.fn(async () => taken());
    vi.stubGlobal('fetch', fetchMock);
    const { ensureDeviceToken } = await load();

    expect(await ensureDeviceToken()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('returns null offline and tries again on the next call', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(created(TOKEN));
    vi.stubGlobal('fetch', fetchMock);
    const { ensureDeviceToken } = await load();

    expect(await ensureDeviceToken()).toBeNull();
    expect(await ensureDeviceToken()).toBe(TOKEN);
  });

  test('refuses a malformed token from the server', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => created('short')));
    const { ensureDeviceToken } = await load();
    expect(await ensureDeviceToken()).toBeNull();
    expect(store.has(TOKEN_KEY)).toBe(false);
  });
});

describe('clearDeviceToken', () => {
  test('forgets the token in memory and in SecureStore', async () => {
    store.set(TOKEN_KEY, TOKEN);
    const { clearDeviceToken, getStoredToken } = await load();
    expect(await getStoredToken()).toBe(TOKEN);

    await clearDeviceToken();

    expect(await getStoredToken()).toBeNull();
    expect(store.has(TOKEN_KEY)).toBe(false);
  });
});

test('does not resurrect a revoked token if SecureStore deletion fails', async () => {
 store.set(TOKEN_KEY, TOKEN);
 const secure = await import('expo-secure-store');
 const service = await load(); await service.getStoredToken();
 vi.mocked(secure.deleteItemAsync).mockRejectedValueOnce(new Error('locked'));
 await service.clearDeviceToken();
 expect(await service.getStoredToken()).toBeNull();
});
