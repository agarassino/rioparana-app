import { describe, expect, test, vi } from 'vitest';
import { resolvePushToken } from '../src/services/pushRegistration';

// The permission dance, with the Expo module injected. What matters here is
// what the app does with each answer — asking again after a refusal is how an
// app gets its notifications switched off at the OS level for good.

const TOKEN = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';

const deps = (over: Record<string, unknown> = {}) => ({
  isDevice: true,
  getPermissions: vi.fn(async () => ({ status: 'undetermined', canAskAgain: true })),
  requestPermissions: vi.fn(async () => ({ status: 'granted', canAskAgain: true })),
  getToken: vi.fn(async () => ({ data: TOKEN })),
  ...over,
});

describe('resolvePushToken', () => {
  test('returns the token once permission is granted', async () => {
    expect(await resolvePushToken(deps())).toBe(TOKEN);
  });

  test('does not ask again when permission is already granted', async () => {
    // A second prompt for something already allowed is noise.
    const d = deps({
      getPermissions: vi.fn(async () => ({ status: 'granted', canAskAgain: true })),
    });

    expect(await resolvePushToken(d)).toBe(TOKEN);
    expect(d.requestPermissions).not.toHaveBeenCalled();
  });

  test('returns null when the reader says no', async () => {
    const d = deps({
      requestPermissions: vi.fn(async () => ({ status: 'denied', canAskAgain: true })),
    });

    expect(await resolvePushToken(d)).toBeNull();
  });

  test('does not ask a reader who already refused', async () => {
    // Android stops showing the dialog after two refusals and the app looks
    // broken. Respecting canAskAgain is what keeps the one prompt worth having.
    const d = deps({
      getPermissions: vi.fn(async () => ({ status: 'denied', canAskAgain: false })),
    });

    expect(await resolvePushToken(d)).toBeNull();
    expect(d.requestPermissions).not.toHaveBeenCalled();
  });

  test('returns null on a simulator, which cannot receive push', async () => {
    const d = deps({ isDevice: false });

    expect(await resolvePushToken(d)).toBeNull();
    expect(d.getPermissions).not.toHaveBeenCalled();
  });

  test('never throws when the token service is unreachable', async () => {
    // This runs on app start. A rejected promise here would take the screen
    // with it over something the reader did not ask for.
    const d = deps({
      getToken: vi.fn(async () => {
        throw new Error('no network');
      }),
    });

    expect(await resolvePushToken(d)).toBeNull();
  });

  test('never throws when the permission check itself fails', async () => {
    const d = deps({
      getPermissions: vi.fn(async () => {
        throw new Error('module missing');
      }),
    });

    expect(await resolvePushToken(d)).toBeNull();
  });

  test('rejects anything that is not an Expo token', async () => {
    // The backend refuses these too. Catching it here saves a round trip and
    // keeps a client bug from looking like a server one.
    const d = deps({ getToken: vi.fn(async () => ({ data: 'hello' })) });

    expect(await resolvePushToken(d)).toBeNull();
  });
});
