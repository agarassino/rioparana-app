import * as SecureStore from 'expo-secure-store';

// A random identifier that lets the backend count how many devices open which
// stations, and whether they come back. It is generated on the device, carries
// nothing about the person, and is never sent anywhere but our own API.

const KEY = 'parana-info.device-id';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  const webCrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (webCrypto?.getRandomValues) return webCrypto.getRandomValues(bytes);

  // Fallback for runtimes without a crypto global. This identifier counts
  // usage; it is not a secret, so a weaker source is acceptable here.
  for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

export function newDeviceId(): string {
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

let cached: string | null = null;

/**
 * Returns this device's identifier, creating and storing one the first time.
 * Storage failures never propagate: a device that cannot persist its id still
 * gets one for the session, which is better than breaking the screen.
 */
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;

  let stored: string | null = null;
  try {
    stored = await SecureStore.getItemAsync(KEY);
  } catch {
    stored = null;
  }

  if (stored && UUID_V4.test(stored)) {
    cached = stored;
    return cached;
  }

  const id = newDeviceId();
  try {
    await SecureStore.setItemAsync(KEY, id);
  } catch {
    // Keep going: the id is still usable for this session.
  }
  cached = id;
  return id;
}
