import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const store = new Map<string, string>();

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (k: string) => store.get(k) ?? null),
  setItemAsync: vi.fn(async (k: string, v: string) => { store.set(k, v); }),
}));

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function load() {
  vi.resetModules();
  return import('../src/services/deviceId');
}

beforeEach(() => store.clear());
afterEach(() => vi.clearAllMocks());

describe('getDeviceId', () => {
  test('creates a v4 identifier the first time', async () => {
    const { getDeviceId } = await load();

    expect(await getDeviceId()).toMatch(UUID_V4);
  });

  test('persists it so the device keeps the same identity', async () => {
    const first = await (await load()).getDeviceId();
    const second = await (await load()).getDeviceId();

    expect(second).toBe(first);
  });

  test('returns the same value within a session without touching storage twice', async () => {
    const secure = await import('expo-secure-store');
    const { getDeviceId } = await load();

    const a = await getDeviceId();
    const b = await getDeviceId();

    expect(b).toBe(a);
    expect(secure.getItemAsync).toHaveBeenCalledTimes(1);
  });

  test('still returns an identifier when storage cannot be read', async () => {
    const secure = await import('expo-secure-store');
    vi.mocked(secure.getItemAsync).mockRejectedValueOnce(new Error('keychain locked'));
    const { getDeviceId } = await load();

    expect(await getDeviceId()).toMatch(UUID_V4);
  });

  test('still returns an identifier when storage cannot be written', async () => {
    const secure = await import('expo-secure-store');
    vi.mocked(secure.setItemAsync).mockRejectedValueOnce(new Error('disk full'));
    const { getDeviceId } = await load();

    expect(await getDeviceId()).toMatch(UUID_V4);
  });

  test('ignores a stored value that is not a valid identifier', async () => {
    store.set('parana-info.device-id', 'basura');
    const { getDeviceId } = await load();

    expect(await getDeviceId()).toMatch(UUID_V4);
  });
});
